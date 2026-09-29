import type { Camera, Photo } from '../../types';
import { nodeSize } from './geometry';

export const FLIP_MS = 450;
export const FLIP_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'; // = --node-ease

/** Viewport pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largest rect of the given aspect that fits `area` (contain), centred. */
export function fitRect(aspect: number, area: Rect): Rect {
  const a = aspect > 0 ? aspect : 1;
  const w = Math.min(area.w, area.h * a);
  const h = w / a;
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

/** Where a node's box is on screen for a given camera (`scale` = the hover/focus scale, 1.03). */
export function nodeScreenRect(p: Photo, cam: Camera, vw: number, vh: number, scale = 1.03): Rect {
  const { w, h } = nodeSize(p);
  const k = cam.scale;
  const cx = vw / 2 + (p.x - cam.x) * k;
  const cy = vh / 2 + (p.y - cam.y) * k;
  const sw = w * k * scale;
  const sh = h * k * scale;
  return { x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh };
}

/**
 * `el` is laid out at `to`. Animates its transform (origin 0 0) so it appears to grow from `from`
 * to `to`. With `reverse` it goes from `to` to `from` instead. The fill is kept ('both').
 */
export function flip(el: HTMLElement, from: Rect, to: Rect, opts: { duration?: number; reverse?: boolean } = {}): Animation {
  el.style.transformOrigin = '0 0';
  const tf = `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})`;
  const frames = opts.reverse ? [{ transform: 'none' }, { transform: tf }] : [{ transform: tf }, { transform: 'none' }];
  return el.animate(frames, { duration: opts.duration ?? FLIP_MS, easing: FLIP_EASE, fill: 'both' });
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
