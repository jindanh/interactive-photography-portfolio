import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { NODE_SIZE } from '../../types';
import type { Camera } from '../../types';
import { clamp, fitCamera, portraitFactor } from '../utils/geometry';
import type { Bounds } from '../utils/geometry';
import { tween } from '../utils/tween';
import type { TweenHandle } from '../utils/tween';

export interface AnimateOpts {
  duration?: number;
  /** Scale dips mid-flight and returns, so the move feels spatial. */
  arc?: boolean;
}

export interface CameraApi {
  animateTo: (target: Partial<Camera>, opts?: AnimateOpts) => Promise<void>;
  getCamera: () => Camera;
  /** Instant, unclamped set. */
  setCamera: (c: Partial<Camera>) => void;
  worldToScreen: (x: number, y: number) => { x: number; y: number };
  screenToWorld: (x: number, y: number) => { x: number; y: number };
  /** Fit bounds (default: all photos) with the initial-view margin. Re-enables refit-on-resize. */
  fitTo: (
    bounds?: Bounds,
    opts?: { animate?: boolean; duration?: number; scaleFactor?: number },
  ) => Promise<void>;
  /** Destination of the running tween, else the current camera. */
  getTarget: () => Camera;
  /** Scale that fitTo() with no args produces for the current viewport. */
  getHomeScale: () => number;
}

interface Internals {
  set: (c: Partial<Camera>) => void;
  clampCam: (c: Camera) => Camera;
  cancelTween: () => void;
  limits: () => { min: number; max: number };
}

const CLICK_SLOP = 4;

/**
 * Camera lives in a ref. Every change is written straight to the world
 * element's transform and `--zoom` on the root (rAF-coalesced). No React state.
 */
export function useCamera(
  rootRef: RefObject<HTMLElement | null>,
  worldRef: RefObject<HTMLElement | null>,
  bounds: Bounds,
): CameraApi {
  const cam = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const size = useRef({ w: 1, h: 1 });
  const interacted = useRef(false);
  const gestures = useRef(0);
  const dirty = useRef(false);
  const raf = useRef(0);
  const running = useRef<TweenHandle | null>(null);
  const internals = useRef<Internals | null>(null);

  const api = useMemo<CameraApi>(() => {
    const limits = () => {
      const { w, h } = size.current;
      const b = boundsRef.current;
      const fitM = fitCamera(b, w, h);
      // whole collection covers ~40% of the viewport at the far limit
      const min = Math.min(fitCamera(b, w, h, 0).scale * 0.4, fitM.scale);
      const max = Math.max((1.5 * Math.min(w, h)) / NODE_SIZE, fitM.scale);
      return { min, max };
    };

    let homeCache: { w: number; h: number; b: Bounds; v: number } | null = null;
    const homeScale = () => {
      const { w, h } = size.current;
      const b = boundsRef.current;
      if (!homeCache || homeCache.w !== w || homeCache.h !== h || homeCache.b !== b) {
        homeCache = { w, h, b, v: fitCamera(b, w, h).scale * portraitFactor(b, w, h) };
      }
      return homeCache.v;
    };

    const flush = () => {
      raf.current = 0;
      if (!dirty.current) return;
      dirty.current = false;
      const root = rootRef.current;
      const world = worldRef.current;
      if (!root || !world) return;
      const { x, y, scale } = cam.current;
      const { w, h } = size.current;
      world.style.transform = `translate3d(${w / 2 - x * scale}px, ${h / 2 - y * scale}px, 0) scale(${scale})`;
      root.style.setProperty('--zoom', String(scale));
      root.style.setProperty('--zoom-rel', String(scale / homeScale()));
    };

    const set = (c: Partial<Camera>) => {
      cam.current = { ...cam.current, ...c };
      dirty.current = true;
      if (!raf.current) raf.current = requestAnimationFrame(flush);
    };

    /** Loose clamp for user input: the collection can't be lost off-screen. */
    const clampCam = (c: Camera): Camera => {
      const { min, max } = limits();
      const scale = clamp(c.scale, min, max);
      const b = boundsRef.current;
      const { w, h } = size.current;
      const axis = (v: number, lo: number, hi: number, view: number) => {
        if ((hi - lo) * scale <= view) {
          // collection smaller than viewport: keep it fully on-screen
          const half = view / (2 * scale);
          return clamp(v, hi - half, lo + half);
        }
        const pad = (view * 0.3) / scale;
        return clamp(v, lo - pad, hi + pad);
      };
      return {
        scale,
        x: axis(c.x, b.minX, b.maxX, w),
        y: axis(c.y, b.minY, b.maxY, h),
      };
    };

    let tweenTarget: Camera | null = null;
    const cancelTween = () => {
      running.current?.cancel();
      running.current = null;
      tweenTarget = null;
    };
    internals.current = { set, clampCam, cancelTween, limits };

    const animateTo: CameraApi['animateTo'] = (target, opts = {}) => {
      cancelTween();
      interacted.current = true;
      const from = { ...cam.current };
      const to: Camera = { ...from, ...target };
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const duration = reduced ? Math.min(opts.duration ?? 700, 200) : (opts.duration ?? 700);
      const dip = opts.arc && !reduced ? 0.18 : 0;
      const h = tween(duration, (t, raw) => {
        const s = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * t);
        set({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          scale: s * (1 - dip * Math.sin(Math.PI * raw)),
        });
      });
      running.current = h;
      tweenTarget = to;
      return h.done.then(() => {
        if (running.current === h) {
          running.current = null;
          tweenTarget = null;
        }
      });
    };

    const fitTo: CameraApi['fitTo'] = (b = boundsRef.current, opts = {}) => {
      const { w, h } = size.current;
      const f = fitCamera(b, w, h);
      f.scale *= opts.scaleFactor ?? portraitFactor(b, w, h);
      if (opts.animate) {
        const g = gestures.current;
        return animateTo(f, { duration: opts.duration ?? 1400 }).then(() => {
          // Re-arm refit-on-resize only if no user gesture interrupted the tween.
          if (gestures.current === g && !running.current) interacted.current = false;
        });
      }
      cancelTween();
      set(f);
      interacted.current = false;
      return Promise.resolve();
    };

    const screenToWorld = (sx: number, sy: number) => {
      const { x, y, scale } = cam.current;
      return { x: x + (sx - size.current.w / 2) / scale, y: y + (sy - size.current.h / 2) / scale };
    };
    const worldToScreen = (wx: number, wy: number) => {
      const { x, y, scale } = cam.current;
      return { x: size.current.w / 2 + (wx - x) * scale, y: size.current.h / 2 + (wy - y) * scale };
    };

    return { animateTo, getCamera: () => ({ ...cam.current }), setCamera: set, worldToScreen, screenToWorld, fitTo, getHomeScale: homeScale, getTarget: () => ({ ...(tweenTarget ?? cam.current) }) };
  }, [rootRef, worldRef]);

  useEffect(() => {
    const root = rootRef.current;
    const I = internals.current;
    if (!root || !I) return;

    const measure = () => {
      const r = root.getBoundingClientRect();
      const w = r.width || 1;
      const h = r.height || 1;
      const changed = w !== size.current.w || h !== size.current.h;
      size.current = { w, h };
      return changed;
    };
    measure();
    void api.fitTo();
    let lastW = size.current.w;
    let lastH = size.current.h;

    const ro = new ResizeObserver(() => {
      measure();
      const { w, h } = size.current;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      if (!interacted.current) void api.fitTo();
      else I.set({});
    });
    ro.observe(root);

    // ---- input ----
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt = { x: 0, y: 0 };
    let moved = false; // exceeded click slop this gesture
    let suppressClick = false;
    let pinch: { dist: number } | null = null;
    let vel = { x: 0, y: 0 };
    let lastT = 0;
    let inertia = 0;

    const stopInertia = () => {
      if (inertia) cancelAnimationFrame(inertia);
      inertia = 0;
    };
    const user = () => {
      interacted.current = true;
      gestures.current++;
      I.cancelTween();
      stopInertia();
    };
    const local = (e: { clientX: number; clientY: number }) => {
      const r = root.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const panBy = (dx: number, dy: number) => {
      const c = cam.current;
      I.set(I.clampCam({ ...c, x: c.x - dx / c.scale, y: c.y - dy / c.scale }));
    };
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const before = api.screenToWorld(sx, sy);
      const { min, max } = I.limits();
      const scale = clamp(cam.current.scale * factor, min, max);
      const { w, h } = size.current;
      I.set(I.clampCam({ scale, x: before.x - (sx - w / 2) / scale, y: before.y - (sy - h / 2) / scale }));
    };

    // Wheel mode is latched per gesture until 150 ms of silence.
    let wheelMode: 'pan' | 'zoom' | null = null;
    let wheelLast = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      user();
      const now = performance.now();
      if (!wheelMode || now - wheelLast > 150) {
        wheelMode =
          e.ctrlKey ? 'zoom'
          : e.deltaMode === 0 && (e.deltaX !== 0 || Math.abs(e.deltaY) < 40) ? 'pan'
          : 'zoom';
      }
      wheelLast = now;
      if (wheelMode === 'pan' && !e.ctrlKey) {
        panBy(-e.deltaX, -e.deltaY);
        return;
      }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = clamp(e.deltaY * unit, -120, 120);
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016)));
    };

    const onDown = (e: PointerEvent) => {
      user();
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) {
        downAt = local(e);
        moved = false;
        suppressClick = false;
        vel = { x: 0, y: 0 };
        lastT = performance.now();
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
        I.cancelTween();
        moved = true;
        suppressClick = true;
        root.classList.add('is-dragging');
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);

      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        panBy((p.x - prev.x) / 2, (p.y - prev.y) / 2);
        if (pinch.dist > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.dist);
        pinch.dist = dist;
        return;
      }

      if (!moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) > CLICK_SLOP) {
        moved = true;
        suppressClick = true;
        I.cancelTween();
        root.classList.add('is-dragging');
        try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      if (!moved) return;
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      lastT = now;
      vel = { x: 0.8 * (dx / dt) + 0.2 * vel.x, y: 0.8 * (dy / dt) + 0.2 * vel.y };
      panBy(dx, dy);
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        root.classList.remove('is-dragging');
        // Small inertia, only if released while still moving.
        if (moved && e.type === 'pointerup' && performance.now() - lastT < 60 && Math.hypot(vel.x, vel.y) > 0.15) {
          let last = performance.now();
          const stepFn = (now: number) => {
            const dt = Math.min(32, now - last);
            last = now;
            const decay = Math.pow(0.94, dt / 16);
            vel = { x: vel.x * decay, y: vel.y * decay };
            panBy(vel.x * dt, vel.y * dt);
            inertia = Math.hypot(vel.x, vel.y) > 0.02 ? requestAnimationFrame(stepFn) : 0;
          };
          inertia = requestAnimationFrame(stepFn);
        }
      } else if (pointers.size === 1) {
        downAt = [...pointers.values()][0];
      }
    };

    // Swallow the click that ends a drag so nodes don't activate.
    const onClickCapture = (e: MouseEvent) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('click', onClickCapture, true);
    return () => {
      ro.disconnect();
      stopInertia();
      I.cancelTween();
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('click', onClickCapture, true);
    };
  }, [api, rootRef]);

  return api;
}
