import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { neighbors, photoById, photos } from '../data';
import { NODE_SIZE } from '../types';
import { VisualCanvas } from './components/VisualCanvas';
import { Intro } from './components/Intro';
import { Connection } from './components/Connection';
import { Trail } from './components/Trail';
import type { CameraApi } from './hooks/useCamera';
import { computeEdges, computeNodeStates, initialThreadState, threadReducer } from './state/threadState';
import type { EdgeRef } from './state/threadState';
import './styles/canvas.css';
import './styles/intro.css';
import './styles/threads.css';

const INTRO_SCALE = 0.88;
const HOVER_GRACE_MS = 140; // lets the pointer cross from a node onto its edge (and back)
const ids = photos.map((p) => p.id);

export function App() {
  const camera = useRef<CameraApi>(null);
  const [state, dispatch] = useReducer(threadReducer, initialThreadState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [introDone, setIntroDone] = useState(false);
  const [hintSeen, setHintSeen] = useState(false);

  // Start slightly zoomed out; the intro dismissal eases to the fit view.
  useEffect(() => {
    const c = camera.current;
    if (!c) return;
    const { scale } = c.getCamera();
    c.setCamera({ scale: scale * INTRO_SCALE });
  }, []);

  const onDismiss = useCallback(() => {
    setIntroDone(true);
    void camera.current?.fitTo(undefined, { animate: true, duration: 1400 });
  }, []);

  useEffect(() => {
    if (state.hoveredId || state.focusedId || state.previewId) setHintSeen(true);
  }, [state.hoveredId, state.focusedId, state.previewId]);

  // Hover clears are delayed so node -> edge -> node crossings don't flicker.
  const nodeTimer = useRef(0);
  const edgeTimer = useRef(0);
  const onNodeHover = useCallback((id: string | null) => {
    window.clearTimeout(nodeTimer.current);
    if (id) dispatch({ type: 'hoverNode', id });
    else nodeTimer.current = window.setTimeout(() => dispatch({ type: 'hoverNode', id: null }), HOVER_GRACE_MS);
  }, []);
  const onEdgeHover = useCallback((edge: EdgeRef | null) => {
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

  const goTo = useCallback((id: string) => {
    const t = photoById.get(id);
    if (!t) return;
    const cur = stateRef.current.focusedId;
    const isNeighbor = cur !== null && neighbors(cur).some((n) => n.photo.id === id);
    dispatch({ type: 'focus', id });
    void camera.current?.animateTo(
      { x: t.x, y: t.y, scale: (0.4 * Math.min(window.innerWidth, window.innerHeight)) / NODE_SIZE },
      { arc: isNeighbor, duration: 700 },
    );
  }, []);

  const onNodeClick = useCallback(
    (id: string, pointerType: string) => {
      const s = stateRef.current;
      if (pointerType === 'touch' && id !== s.previewId) {
        dispatch({ type: 'preview', id });
        return;
      }
      if (id === s.focusedId) {
        dispatch({ type: 'preview', id: null });
        return;
      }
      goTo(id);
    },
    [goTo],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      dispatch({ type: 'clear' });
      void camera.current?.fitTo(undefined, { animate: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nodeStates = useMemo(() => computeNodeStates(state, ids), [state]);
  const edges = useMemo(() => computeEdges(state), [state]);

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
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        connections={connections}
      />
      <Intro onDismiss={onDismiss} />
      <div className={`thread-hint${introDone && !hintSeen ? ' is-visible' : ''}`} aria-hidden="true">
        Follow the visual thread.
      </div>
    </>
  );
}
