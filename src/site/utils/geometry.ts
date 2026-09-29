import { NODE_SIZE } from '../../types';
import type { Camera, Photo } from '../../types';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** World-unit size of a node (long edge = NODE_SIZE). */
export function nodeSize(p: Pick<Photo, 'aspect'>): { w: number; h: number } {
  const a = p.aspect >= 1 ? p.aspect : 1 / p.aspect;
  const short = NODE_SIZE / a;
  return p.aspect >= 1 ? { w: NODE_SIZE, h: short } : { w: short, h: NODE_SIZE };
}

/** Bounding box of all node boxes (x/y are node centers). */
export function photoBounds(photos: readonly Photo[]): Bounds {
  if (photos.length === 0) return { minX: -NODE_SIZE, minY: -NODE_SIZE, maxX: NODE_SIZE, maxY: NODE_SIZE };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of photos) {
    const { w, h } = nodeSize(p);
    minX = Math.min(minX, p.x - w / 2);
    maxX = Math.max(maxX, p.x + w / 2);
    minY = Math.min(minY, p.y - h / 2);
    maxY = Math.max(maxY, p.y + h / 2);
  }
  return { minX, minY, maxX, maxY };
}

/** Camera that centers `b` in the viewport, leaving `margin` (fraction) on each side. */
export function fitCamera(b: Bounds, vw: number, vh: number, margin = 0.08): Camera {
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const scale = Math.min((vw * (1 - margin * 2)) / bw, (vh * (1 - margin * 2)) / bh);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, scale };
}

/** Extra zoom that makes a portrait viewport fill more of its height (1 elsewhere). */
export function portraitFactor(b: Bounds, vw: number, vh: number, margin = 0.08): number {
  if (vw / vh >= 0.8) return 1;
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const widthFit = (vw * (1 - margin * 2)) / bw;
  const heightFit = (vh * (1 - margin * 2)) / bh;
  return Math.min(1.4, heightFit / widthFit);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const CURVE = 0.15;
const GAP = 4;

/** Point where the ray from center `p` toward `q` leaves p's box (plus a small gap). */
function boxExit(p: Photo, q: Photo): { x: number; y: number } {
  const { w, h } = nodeSize(p);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity);
  const d = Math.min(len * 0.45, t * len + GAP);
  return { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
}

/**
 * Gentle quadratic curve between two photos. Direction is normalized by id so A->B and B->A
 * produce the identical path (edges, trail and hit-paths always coincide).
 */
export function curvePath(a: Photo, b: Photo): string {
  if (b.id < a.id) [a, b] = [b, a];
  const s = boxExit(a, b);
  const e = boxExit(b, a);
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const cx = (s.x + e.x) / 2 - dy * CURVE;
  const cy = (s.y + e.y) / 2 + dx * CURVE;
  return `M${s.x.toFixed(1)} ${s.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}
