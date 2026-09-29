import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Neighbor } from '../../data';
import type { Photo } from '../../types';
import { FLIP_MS, fitRect, flip, prefersReducedMotion } from '../utils/flip';
import type { Rect } from '../utils/flip';
import { photoLabel } from '../utils/label';
import '../styles/detail.css';

export interface DetailProps {
  /** === focusedId === detailId. Changes on follow (no remount; cross-fades). */
  photo: Photo;
  /** Connected photos, strongest first. */
  neighbors: readonly Neighbor[];
  /** Open start: the photo's node rect on screen. */
  getNodeRect: (id: string) => Rect | null;
  /** Close end: the node rect once the camera has settled (App also re-times the camera). */
  prepareReturn: (id: string, durationMs: number) => Rect | null;
  onFollow: (id: string) => void;
  /** Called when the close animation ends. */
  onClosed: () => void;
}

const BASE = import.meta.env.BASE_URL;
const REDUCED_MS = 200;
const FOLLOW_MS = 300;

/** Room for the image: right strip on desktop, bottom strip at <= 600 px; 16 px reserved for the palette bar. */
function stageRect(vw: number, vh: number): Rect {
  const bar = 16;
  if (vw <= 600) {
    const top = 48;
    const bottom = 16 + 56 + 7 + 20;
    return { x: 16, y: top, w: vw - 32, h: Math.max(60, vh - top - bottom - bar) };
  }
  const pad = 56;
  const right = pad + 72 + 32;
  return { x: pad, y: pad, w: Math.max(60, vw - pad - right), h: Math.max(60, vh - pad * 2 - bar) };
}

interface LayerProps {
  photo: Photo;
  rect: Rect;
  role: 'first' | 'entering';
  current: boolean;
}

const Layer = memo(function Layer({ photo, rect, role, current }: LayerProps) {
  const [lg, setLg] = useState(false);
  return (
    <div
      className={`detail-layer${role === 'entering' ? ' is-entering' : ''}${current ? ' is-current' : ' is-leaving'}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, backgroundColor: photo.colors[0]?.hex }}
    >
      <img className="detail-img" src={BASE + photo.src.sm} alt="" draggable={false} />
      <img
        className={`detail-img detail-img-lg${lg ? ' is-loaded' : ''}`}
        src={BASE + photo.src.lg}
        alt=""
        draggable={false}
        decoding="async"
        onLoad={() => setLg(true)}
      />
      <div className="detail-bar" aria-hidden="true">
        {photo.colors.map((c, i) => (
          <i key={i} style={{ flexGrow: c.weight, backgroundColor: c.hex }} />
        ))}
      </div>
    </div>
  );
});

export function Detail({ photo, neighbors, getNodeRect, prepareReturn, onFollow, onClosed }: DetailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  // Layers: the last is the current photo; earlier ones are cross-fading out after a follow.
  const [layers, setLayers] = useState<{ photo: Photo; role: 'first' | 'entering' }[]>(() => [{ photo, role: 'first' }]);
  if (layers[layers.length - 1].photo.id !== photo.id) {
    setLayers([...layers.slice(-2), { photo, role: 'entering' }]);
  }

  const phase = useRef<'opening' | 'open' | 'closing'>('opening');
  const mounted = useRef(false);
  const anims = useRef<Animation[]>([]);
  const openAnims = useRef<Animation[]>([]);
  const openId = useRef(photo.id);
  const photoRef = useRef(photo);
  photoRef.current = photo;
  const cb = useRef({ getNodeRect, prepareReturn, onClosed });
  cb.current = { getNodeRect, prepareReturn, onClosed };

  const track = (a: Animation, opening = false) => {
    anims.current.push(a);
    if (opening) openAnims.current.push(a);
    return a;
  };
  const fade = (el: Element | null | undefined, from: number, to: number, ms: number, delay = 0, opening = false) =>
    el ? track(el.animate([{ opacity: from }, { opacity: to }], { duration: ms, delay, easing: 'ease', fill: 'both' }), opening) : null;

  const currentLayerEl = () => rootRef.current?.querySelector<HTMLElement>('.detail-layer.is-current') ?? null;
  const chromeEls = () => [...(rootRef.current?.querySelectorAll('.detail-strip, .detail-close') ?? [])];

  // Open: FLIP from the node (measured before paint; the node is concealed in this same commit).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    mounted.current = true;
    phase.current = 'opening';
    openAnims.current = [];
    root.classList.add('is-opening');
    root.focus({ preventScroll: true });
    const el = currentLayerEl();
    const to = fitRect(photoRef.current.aspect, stageRect(window.innerWidth, window.innerHeight));
    const from = cb.current.getNodeRect(openId.current);
    const reduced = prefersReducedMotion();
    let main: Animation | null;
    if (reduced || !from || !el) {
      fade(veilRef.current, 0, 1, REDUCED_MS, 0, true);
      fade(el, 0, 1, REDUCED_MS, 0, true);
      main = fade(root.querySelector('.detail-strip'), 0, 1, REDUCED_MS, 0, true);
      fade(closeRef.current, 0, 1, REDUCED_MS, 0, true);
    } else {
      main = track(flip(el, from, to, { duration: FLIP_MS }), true);
      fade(veilRef.current, 0, 1, FLIP_MS, 0, true);
      fade(root.querySelector('.detail-strip'), 0, 1, 300, 200, true);
      fade(closeRef.current, 0, 1, 300, 200, true);
    }
    const done = () => {
      if (phase.current !== 'opening') return;
      phase.current = 'open';
      root.classList.remove('is-opening');
      // Release the fills so the resting layout is plain CSS.
      openAnims.current.forEach((a) => a.cancel());
      openAnims.current = [];
    };
    main?.finished.then(done, () => {});
    return () => {
      mounted.current = false;
      anims.current.forEach((a) => a.cancel());
      anims.current = [];
      openAnims.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a follow: drop the outgoing layer once faded, and re-announce the label.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => setLayers((l) => (l.length > 1 ? l.slice(-1) : l)), FOLLOW_MS + 50);
    return () => window.clearTimeout(t);
  }, [photo.id]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const close = useCallback(() => {
    if (phase.current === 'closing' || !mounted.current) return;
    const wasOpening = phase.current === 'opening';
    phase.current = 'closing';
    const root = rootRef.current;
    if (!root) return;
    const reduced = prefersReducedMotion();
    const ms = reduced ? REDUCED_MS : FLIP_MS;
    const id = photoRef.current.id;
    const end = cb.current.prepareReturn(id, ms);
    const finish = () => {
      if (mounted.current) cb.current.onClosed();
    };
    root.classList.add('is-closing');
    root.classList.remove('is-opening');
    const el = currentLayerEl();
    let main: Animation | null;
    if (wasOpening && openAnims.current.length && id === openId.current) {
      // Reverse the opening in flight.
      openAnims.current.forEach((a) => a.reverse());
      main = openAnims.current[0];
    } else if (reduced || !end || !el) {
      main = fade(veilRef.current, 1, 0, ms);
      fade(el, 1, 0, ms);
      fade(root.querySelector('.detail-strip'), 1, 0, ms);
      fade(closeRef.current, 1, 0, ms);
    } else {
      openAnims.current.forEach((a) => a.cancel());
      main = track(
        flip(el, end, fitRect(photoRef.current.aspect, stageRect(window.innerWidth, window.innerHeight)), {
          duration: ms,
          reverse: true,
        }),
      );
      fade(veilRef.current, 1, 0, ms);
      chromeEls().forEach((c) => fade(c, 1, 0, Math.round(ms * 0.6)));
    }
    if (main) main.finished.then(finish, () => {});
    else finish();
  }, []);

  // Esc / Tab are owned here (capture phase) so App's handlers never see them. Wheel is ignored.
  useEffect(() => {
    const root = rootRef.current!;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        close();
        return;
      }
      const items = [...root.querySelectorAll<HTMLElement>('.detail-thumb'), ...(closeRef.current ? [closeRef.current] : [])];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = i < 0 ? (e.shiftKey ? items.length - 1 : 0) : (i + (e.shiftKey ? items.length - 1 : 1)) % items.length;
      items[next].focus();
    };
    const onWheel = (e: WheelEvent) => e.preventDefault();
    window.addEventListener('keydown', onKey, true);
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      root.removeEventListener('wheel', onWheel);
    };
  }, [close]);

  const stage = stageRect(vp.w, vp.h);

  return (
    <div
      ref={rootRef}
      className="detail"
      role="dialog"
      aria-modal="true"
      aria-label={photoLabel(photo)}
      aria-describedby="kbd-help"
      tabIndex={-1}
      onClick={(e) => {
        if ((e.target as Element).closest('.detail-thumb')) return;
        close();
      }}
    >
      <div className="detail-veil" ref={veilRef} />
      {layers.map((l, i) => (
        <Layer key={l.photo.id} photo={l.photo} rect={fitRect(l.photo.aspect, stage)} role={l.role} current={i === layers.length - 1} />
      ))}
      <nav className="detail-strip" aria-label="Connected photographs">
        {neighbors.map((n) => (
          <button
            key={n.photo.id}
            type="button"
            className="detail-thumb"
            aria-label={`Follow the thread to ${photoLabel(n.photo)}`}
            onClick={() => onFollow(n.photo.id)}
          >
            <img
              src={BASE + n.photo.src.sm}
              alt=""
              draggable={false}
              style={{
                width: `calc(var(--thumb) * ${n.photo.aspect >= 1 ? 1 : n.photo.aspect})`,
                aspectRatio: String(n.photo.aspect),
                backgroundColor: n.photo.colors[0]?.hex,
              }}
            />
            <i
              className="detail-thumb-line"
              style={{ background: `linear-gradient(90deg, ${photo.colors[0]?.hex}, ${n.photo.colors[0]?.hex})` }}
            />
          </button>
        ))}
      </nav>
      <button type="button" className="detail-close" ref={closeRef} aria-label="Close">
        ×
      </button>
    </div>
  );
}
