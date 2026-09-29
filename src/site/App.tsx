import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { neighbors, photoById, photos } from '../data';
import { VisualCanvas } from './components/VisualCanvas';
import { Intro } from './components/Intro';
import { Connection } from './components/Connection';
import { Trail } from './components/Trail';
import { Detail } from './components/Detail';
import type { CameraApi } from './hooks/useCamera';
import { computeEdges, computeNodeStates, computeTabbable, focusCycle, initialThreadState, threadReducer } from './state/threadState';
import type { EdgeRef } from './state/threadState';
import { focusFrame } from './utils/focusFrame';
import { nodeScreenRect, prefersReducedMotion } from './utils/flip';
import type { Rect } from './utils/flip';
import './styles/canvas.css';
import './styles/abstraction.css';
import './styles/intro.css';
import './styles/threads.css';

const INTRO_SCALE = 0.88;
const TEASER_MS = 2200;
const LOCK_SLOP = 4; // px the pointer must travel before hover unlocks
const HOVER_GRACE_MS = 140; // lets the pointer cross from a node onto its edge (and back)
const DOUBLE_CLICK_MS = 350; // a second click this soon after a focus is the tail of a double-click
const CLOSER_HINT_MS = 8000;
const ids = photos.map((p) => p.id);

interface Pt {
  x: number;
  y: number;
}

export function App() {
  const camera = useRef<CameraApi>(null);
  const [state, dispatch] = useReducer(threadReducer, initialThreadState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [introDone, setIntroDone] = useState(false);
  const [hintSeen, setHintSeen] = useState(false);
  const [closerDone, setCloserDone] = useState(false);
  const [coarse] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

  // Start slightly zoomed out; the intro dismissal eases to the fit view.
  useEffect(() => {
    const c = camera.current;
    if (!c) return;
    const { scale } = c.getCamera();
    c.setCamera({ scale: scale * INTRO_SCALE });
  }, []);

  // One-shot teaser: after the intro settles, briefly preview one well-connected node.
  const engaged = useRef(false);
  const teaser = useRef<{ id: string | null; timer: number; used: boolean }>({ id: null, timer: 0, used: false });
  const endTeaser = useCallback(() => {
    const t = teaser.current;
    window.clearTimeout(t.timer);
    if (t.id && stateRef.current.previewId === t.id && !stateRef.current.focusedId) {
      dispatch({ type: 'preview', id: null });
    }
    t.id = null;
  }, []);
  useEffect(() => {
    const onEngage = () => {
      engaged.current = true;
      endTeaser();
    };
    const evs = ['pointerdown', 'wheel', 'keydown'] as const;
    evs.forEach((ev) => window.addEventListener(ev, onEngage, { passive: true, capture: true }));
    return () => {
      evs.forEach((ev) => window.removeEventListener(ev, onEngage, true));
      window.clearTimeout(teaser.current.timer);
    };
  }, [endTeaser]);

  const onDismiss = useCallback(() => {
    setIntroDone(true);
    void camera.current?.fitTo(undefined, { animate: true, duration: 1400 }).then(() => {
      const t = teaser.current;
      const c = camera.current;
      if (!c || engaged.current || t.used || stateRef.current.focusedId) return;
      t.used = true;
      const { x, y } = c.getCamera();
      let best: string | null = null;
      let bestD = Infinity;
      for (const p of photos) {
        if (neighbors(p.id).length < 3) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) {
          bestD = d;
          best = p.id;
        }
      }
      if (!best) return;
      t.id = best;
      dispatch({ type: 'preview', id: best });
      t.timer = window.setTimeout(endTeaser, TEASER_MS);
    });
  }, [endTeaser]);

  useEffect(() => {
    if (state.focusedId) setHintSeen(true);
  }, [state.focusedId]);

  // "Look closer" hint: shown after the first focus until the first open, or 8 s after it first showed.
  const closerVisible = introDone && state.focusedId !== null && state.detailId === null && !closerDone;
  const closerStart = useRef<number | null>(null);
  useEffect(() => {
    if (!closerVisible) return;
    if (closerStart.current === null) closerStart.current = performance.now();
    const left = CLOSER_HINT_MS - (performance.now() - closerStart.current);
    const t = window.setTimeout(() => setCloserDone(true), Math.max(0, left));
    return () => window.clearTimeout(t);
  }, [closerVisible]);
  useEffect(() => {
    if (state.detailId !== null) setCloserDone(true);
  }, [state.detailId]);

  // Hover lock: after camera motion under a still pointer, ignore hover until it really moves.
  const lastPointer = useRef<Pt | null>(null);
  const lock = useRef<Pt | null>(null);

  // Hover clears are delayed so node -> edge -> node crossings don't flicker.
  const nodeTimer = useRef(0);
  const edgeTimer = useRef(0);
  const onNodeHover = useCallback((id: string | null, source?: 'keyboard') => {
    if (id && lock.current && source !== 'keyboard') return;
    window.clearTimeout(nodeTimer.current);
    if (id && source === 'keyboard') {
      // Keep a keyboard-focused node comfortably on-screen (no scale change).
      const c = camera.current;
      const p = photoById.get(id);
      if (c && p) {
        const sp = c.worldToScreen(p.x, p.y);
        const mx = window.innerWidth * 0.1;
        const my = window.innerHeight * 0.1;
        if (sp.x < mx || sp.x > window.innerWidth - mx || sp.y < my || sp.y > window.innerHeight - my) {
          lock.current = lastPointer.current;
          void c.animateTo({ x: p.x, y: p.y }, { duration: 400 });
        }
      }
    }
    if (id) dispatch({ type: 'hoverNode', id });
    else nodeTimer.current = window.setTimeout(() => dispatch({ type: 'hoverNode', id: null }), HOVER_GRACE_MS);
  }, []);
  const onEdgeHover = useCallback((edge: EdgeRef | null) => {
    if (edge && lock.current) return;
    window.clearTimeout(edgeTimer.current);
    if (edge) {
      window.clearTimeout(nodeTimer.current); // keep the source node's edges alive while on the edge
      dispatch({ type: 'hoverEdge', edge });
    } else {
      edgeTimer.current = window.setTimeout(() => dispatch({ type: 'hoverEdge', edge: null }), HOVER_GRACE_MS);
      nodeTimer.current = window.setTimeout(() => dispatch({ type: 'hoverNode', id: null }), HOVER_GRACE_MS);
    }
  }, []);
  useEffect(
    () => () => {
      window.clearTimeout(nodeTimer.current);
      window.clearTimeout(edgeTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      const l = lock.current;
      if (!l || Math.hypot(e.clientX - l.x, e.clientY - l.y) <= LOCK_SLOP) return;
      lock.current = null;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.photo-node') as HTMLElement | null;
      if (el?.dataset.id) onNodeHover(el.dataset.id);
    };
    const onWheel = () => {
      lock.current = lastPointer.current;
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('wheel', onWheel, { passive: true, capture: true });
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('wheel', onWheel, true);
    };
  }, [onNodeHover]);

  const focusAt = useRef(0);
  const goTo = useCallback((id: string) => {
    const frame = focusFrame(id, window.innerWidth, window.innerHeight);
    if (!frame) return;
    const cur = stateRef.current.focusedId;
    const isNeighbor = cur !== null && neighbors(cur).some((n) => n.photo.id === id);
    lock.current = lastPointer.current;
    focusAt.current = performance.now();
    window.clearTimeout(nodeTimer.current);
    window.clearTimeout(edgeTimer.current);
    dispatch({ type: 'hoverNode', id: null });
    dispatch({ type: 'hoverEdge', edge: null });
    dispatch({ type: 'focus', id });
    void camera.current?.animateTo(frame, { arc: isNeighbor, duration: 700 });
  }, []);

  const onBackgroundClick = useCallback(() => dispatch({ type: 'clear' }), []);

  const onNodeClick = useCallback(
    (id: string, pointerType: string) => {
      endTeaser();
      const s = stateRef.current;
      if (s.detailId) return;
      if (id === s.focusedId) {
        if (pointerType !== 'keyboard' && performance.now() - focusAt.current < DOUBLE_CLICK_MS) return; // 2nd click of a double-click
        dispatch({ type: 'openDetail', id });
        return;
      }
      if (pointerType === 'touch' && id !== s.previewId) {
        dispatch({ type: 'preview', id });
        return;
      }
      goTo(id);
    },
    [goTo, endTeaser],
  );

  // Detail bridge.
  const getNodeRect = useCallback((id: string): Rect | null => {
    const el = document.querySelector<HTMLElement>(`.photo-node[data-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, []);
  const prepareReturn = useCallback((id: string, durationMs: number): Rect | null => {
    const c = camera.current;
    const p = photoById.get(id);
    if (!c || !p) return null;
    // Re-time any camera move still in flight so the camera and the image land together.
    const T = c.getTarget();
    void c.animateTo(T, { duration: durationMs });
    return nodeScreenRect(p, T, window.innerWidth, window.innerHeight, prefersReducedMotion() ? 1 : 1.03);
  }, []);
  const onClosed = useCallback(() => dispatch({ type: 'closeDetail' }), []);
  const prevDetail = useRef<string | null>(null);
  useEffect(() => {
    if (prevDetail.current !== null && state.detailId === null) {
      // Layout effects (VisualCanvas removing `inert`) have already run.
      const f = stateRef.current.focusedId;
      if (f) document.querySelector<HTMLElement>(`.photo-node[data-id="${f}"]`)?.focus({ preventScroll: true });
      lock.current = lastPointer.current;
    }
    prevDetail.current = state.detailId;
  }, [state.detailId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stateRef.current.detailId) return; // the detail owns Esc and Tab while open
      if (e.key === 'Tab') {
        // While a node is focused, Tab cycles [focused, ...neighbors by strength]. Elsewhere it is native.
        const f = stateRef.current.focusedId;
        const cur = (document.activeElement as HTMLElement | null)?.closest?.('.photo-node') as HTMLElement | null;
        if (!f || !cur?.dataset.id) return;
        const cycle = focusCycle(f);
        const i = cycle.indexOf(cur.dataset.id);
        if (i < 0) return;
        e.preventDefault();
        const next = cycle[(i + (e.shiftKey ? cycle.length - 1 : 1)) % cycle.length];
        document.querySelector<HTMLElement>(`.photo-node[data-id="${next}"]`)?.focus();
        return;
      }
      if (e.key !== 'Escape') return;
      dispatch({ type: 'clear' });
      lock.current = lastPointer.current;
      void camera.current?.fitTo(undefined, { animate: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nodeStates = useMemo(() => computeNodeStates(state, ids), [state]);
  const tabbable = useMemo(() => computeTabbable(state.focusedId, ids), [state.focusedId]);
  const edges = useMemo(() => computeEdges(state), [state]);

  const detailPhoto = state.detailId ? (photoById.get(state.detailId) ?? null) : null;

  const connections = (
    <>
      <Trail trail={state.trail} focusedId={state.focusedId} />
      <Connection edges={edges} onEdgeHover={onEdgeHover} onEdgeClick={goTo} />
    </>
  );

  return (
    <>
      <VisualCanvas
        ref={camera}
        nodeStates={nodeStates}
        tabbable={tabbable}
        focusedId={state.focusedId}
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onBackgroundClick={onBackgroundClick}
        connections={connections}
        inert={state.detailId !== null}
        concealedId={state.detailId}
      />
      {detailPhoto && (
        <Detail
          photo={detailPhoto}
          neighbors={neighbors(detailPhoto.id)}
          getNodeRect={getNodeRect}
          prepareReturn={prepareReturn}
          onFollow={goTo}
          onClosed={onClosed}
        />
      )}
      <Intro onDismiss={onDismiss} />
      <div className={`thread-hint${introDone && !hintSeen ? ' is-visible' : ''}`} aria-hidden="true">
        Follow the visual thread.
      </div>
      <div className={`thread-hint${closerVisible ? ' is-visible' : ''}`} aria-hidden="true">
        {coarse ? 'Tap again to look closer.' : 'Click again to look closer.'}
      </div>
      <p id="kbd-help" className="kbd-hint">
        {state.detailId
          ? 'Tab: connected photos · Enter: follow · Esc: close'
          : 'Tab: connected photos · Enter: follow / look closer · Esc: leave'}
      </p>
    </>
  );
}
