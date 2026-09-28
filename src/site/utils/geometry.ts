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
