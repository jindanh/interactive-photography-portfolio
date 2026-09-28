import { NODE_SIZE, type Connection } from '../types';
import { hexToLab, labHueChroma } from './color';
import type { PhotoBase } from './similarity';

const ITERATIONS = 300;
const GAP = 0.25 * NODE_SIZE;
const SPRING_LENGTH = 1.45 * NODE_SIZE;

/**
 * Deterministic color-seeded layout (no Math.random).
 * Seed: dominant color hue -> angle, lightness -> radius (light colors sit
 * further out); low-chroma neutrals are pulled toward the center.
 * Relaxation (300 iterations): edge springs (rest length 1.45 * NODE_SIZE
 * between centers), box collision on each node's real rectangle with a
 * 0.25 * NODE_SIZE clear gap, and weak gravity toward the origin.
 * Result is recentered on (0,0) and rounded to integers.
 * Returns id -> {x, y} (world CENTER of the node).
 */
export function computeLayout(photos: PhotoBase[], connections: Connection[]): Map<string, { x: number; y: number }> {
  const n = photos.length;
  const out = new Map<string, { x: number; y: number }>();
  if (n === 0) return out;

  const w = photos.map((p) => (p.aspect >= 1 ? NODE_SIZE : NODE_SIZE * p.aspect));
  const h = photos.map((p) => (p.aspect >= 1 ? NODE_SIZE / p.aspect : NODE_SIZE));
  const px = new Float64Array(n);
  const py = new Float64Array(n);

  const ring = NODE_SIZE * Math.sqrt(n) * 0.75;
  photos.forEach((p, i) => {
    const lab = hexToLab(p.colors[0].hex);
    const { hue, chroma } = labHueChroma(lab);
    const angle = (hue * Math.PI) / 180;
    const chromaK = Math.min(1, chroma / 45);
    const r = ring * (0.35 + 0.65 * (lab[0] / 100)) * (0.25 + 0.75 * chromaK);
    // tiny index-based offset so coincident seeds separate deterministically
    px[i] = Math.cos(angle) * r + Math.cos(i * 2.399) * 4;
    py[i] = Math.sin(angle) * r + Math.sin(i * 2.399) * 4;
  });

  const index = new Map(photos.map((p, i) => [p.id, i]));
  const links: [number, number, number][] = [];
  for (const c of connections) {
    const a = index.get(c.source), b = index.get(c.target);
    if (a !== undefined && b !== undefined) links.push([a, b, 0.5 + 0.5 * c.strength]);
  }

  const collide = () => {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = px[j] - px[i], dy = py[j] - py[i];
        const ox = (w[i] + w[j]) / 2 + GAP - Math.abs(dx);
        const oy = (h[i] + h[j]) / 2 + GAP - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // separate along the axis of least overlap
        if (ox < oy) {
          const s = (dx === 0 ? (i < j ? -1 : 1) : Math.sign(dx)) * (ox / 2);
          px[i] -= s; px[j] += s;
        } else {
          const s = (dy === 0 ? (i < j ? -1 : 1) : Math.sign(dy)) * (oy / 2);
          py[i] -= s; py[j] += s;
        }
      }
  };

  for (let it = 0; it < ITERATIONS; it++) {
    const cooling = 1 - it / ITERATIONS;
    const step = 0.06 + 0.14 * cooling;
    for (const [a, b, k] of links) {
      const dx = px[b] - px[a], dy = py[b] - py[a];
      const d = Math.hypot(dx, dy) || 1;
      const f = ((d - SPRING_LENGTH) / d) * step * k;
      px[a] += dx * f; py[a] += dy * f;
      px[b] -= dx * f; py[b] -= dy * f;
    }
    for (let i = 0; i < n; i++) {
      px[i] *= 1 - 0.004;
      py[i] *= 1 - 0.004;
    }
    collide();
  }
  for (let extra = 0; extra < 60; extra++) collide();

  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += px[i]; cy += py[i]; }
  cx /= n; cy /= n;
  photos.forEach((p, i) => out.set(p.id, { x: Math.round(px[i] - cx), y: Math.round(py[i] - cy) }));
  return out;
}

/** Number of pairs whose real boxes come closer than the required gap (0 = none). */
export function overlapCount(photos: PhotoBase[], pos: Map<string, { x: number; y: number }>): number {
  let bad = 0;
  for (let i = 0; i < photos.length; i++)
    for (let j = i + 1; j < photos.length; j++) {
      const a = photos[i], b = photos[j];
      const pa = pos.get(a.id)!, pb = pos.get(b.id)!;
      const aw = a.aspect >= 1 ? NODE_SIZE : NODE_SIZE * a.aspect, ah = a.aspect >= 1 ? NODE_SIZE / a.aspect : NODE_SIZE;
      const bw = b.aspect >= 1 ? NODE_SIZE : NODE_SIZE * b.aspect, bh = b.aspect >= 1 ? NODE_SIZE / b.aspect : NODE_SIZE;
      if ((aw + bw) / 2 + GAP - Math.abs(pa.x - pb.x) > 1 && (ah + bh) / 2 + GAP - Math.abs(pa.y - pb.y) > 1) bad++;
    }
  return bad;
}
