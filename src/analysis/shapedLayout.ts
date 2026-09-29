import type { Connection } from '../types';
import { mulberry32 } from './color';
import { hungarian } from './hungarian';
import { LAYOUT_GAP, computeLayout, nodeBox, overlapCount, resolveCollisions } from './layout';
import { MASK_SIZE, labelComponents, maskArea, normalizeMask, type Mask } from './shapes';
import type { PhotoBase } from './similarity';

export interface ShapedLayoutOptions {
  seed?: number; // default 1: mulberry32 for the Lloyd start
  iterations?: number; // Lloyd iterations, default 30
  spacing?: number; // target MEAN nearest-slot distance, world units, default 320
  seedWeight?: number; // lambda in the refine energy, default 0.15
  maxSwapPasses?: number; // default 40
  maxResolvePasses?: number; // default 500
}

/** world_x = x0 + mx * scale ; world_y = y0 + my * scale   (mx, my in mask pixel units of result.mask) */
export interface MaskFrame { scale: number; x0: number; y0: number }

export interface LayoutStats {
  avgConnectionLength: number; // mean centre distance over connections (world units)
  overlaps: number; // overlapCount(photos, positions)
  outside: number; // centres not inside the mask (tolerance 0.25*spacing); always 0 for Organic
}

export interface ShapedLayoutResult {
  positions: Map<string, { x: number; y: number }>; // insertion order = photos order; integers
  mask: Mask; // the NORMALIZED mask actually used (draw this one as the underlay)
  frame: MaskFrame | null; // null on fallback
  stats: LayoutStats;
  organicStats: LayoutStats;
  ratio: number; // stats.avgConnectionLength / organicStats.avgConnectionLength (1 if organic is 0)
  fallback: null | 'empty-mask' | 'too-thin';
}

type Pos = Map<string, { x: number; y: number }>;

export function avgConnectionLength(connections: Connection[], pos: Pos): number {
  let sum = 0, cnt = 0;
  for (const c of connections) {
    const a = pos.get(c.source), b = pos.get(c.target);
    if (!a || !b) continue;
    sum += Math.hypot(a.x - b.x, a.y - b.y);
    cnt++;
  }
  return cnt ? sum / cnt : 0;
}

export function layoutStats(photos: PhotoBase[], connections: Connection[], pos: Pos): LayoutStats {
  return { avgConnectionLength: avgConnectionLength(connections, pos), overlaps: overlapCount(photos, pos), outside: 0 };
}

// ------------------------------------------------------------------ slots

interface Slots { x: Float64Array; y: Float64Array }
const slotCache = new WeakMap<Mask, Map<string, Slots>>();

/** Largest-remainder split of n by component area (ties go to the lower index). */
function allocate(areas: number[], n: number): number[] {
  const total = areas.reduce((a, b) => a + b, 0);
  const base = areas.map((a) => Math.min(a, Math.floor((n * a) / total)));
  let left = n - base.reduce((a, b) => a + b, 0);
  const order = areas
    .map((a, i) => ({ i, r: (n * a) / total - Math.floor((n * a) / total) }))
    .sort((p, q) => q.r - p.r || p.i - q.i);
  for (let guard = 0; left > 0 && guard < 4 * n; guard++)
    for (const o of order) {
      if (left === 0) break;
      if (base[o.i] < areas[o.i]) { base[o.i]++; left--; }
    }
  return base;
}

function lloydComponent(m: Mask, comp: number[], k: number, iterations: number, rng: () => number, out: number[]): void {
  const len = comp.length;
  const px = new Float64Array(len), py = new Float64Array(len);
  for (let t = 0; t < len; t++) { px[t] = (comp[t] % m.width) + 0.5; py[t] = Math.floor(comp[t] / m.width) + 0.5; }
  const sx = new Float64Array(k), sy = new Float64Array(k);
  const taken = new Set<number>();
  for (let i = 0; i < k; i++) {
    let t = Math.floor(rng() * len);
    while (taken.has(t)) t = (t + 1) % len;
    taken.add(t);
    sx[i] = px[t]; sy[i] = py[t];
  }
  const cell = new Int32Array(len);
  const assign = () => {
    for (let t = 0; t < len; t++) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < k; i++) {
        const dx = px[t] - sx[i], dy = py[t] - sy[i];
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      cell[t] = best;
    }
  };
  const cx = new Float64Array(k), cy = new Float64Array(k), cn = new Float64Array(k);
  for (let it = 0; it < iterations; it++) {
    assign();
    cx.fill(0); cy.fill(0); cn.fill(0);
    for (let t = 0; t < len; t++) { const c = cell[t]; cx[c] += px[t]; cy[c] += py[t]; cn[c]++; }
    for (let i = 0; i < k; i++) if (cn[i]) { sx[i] = cx[i] / cn[i]; sy[i] = cy[i] / cn[i]; }
  }
  assign();
  // snap each slot to the pixel centre of its own cell nearest its centroid (centroids of
  // non-convex cells can fall outside the mask)
  const bestD = new Float64Array(k).fill(Infinity), bestT = new Int32Array(k).fill(-1);
  for (let t = 0; t < len; t++) {
    const c = cell[t];
    const dx = px[t] - sx[c], dy = py[t] - sy[c];
    const d = dx * dx + dy * dy;
    if (d < bestD[c]) { bestD[c] = d; bestT[c] = t; }
  }
  for (let i = 0; i < k; i++) {
    let t = bestT[i];
    if (t < 0) { // empty cell: nearest pixel of the component
      let bd = Infinity;
      for (let u = 0; u < len; u++) {
        const dx = px[u] - sx[i], dy = py[u] - sy[i];
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; t = u; }
      }
    }
    out.push(px[t], py[t]);
  }
}

function computeSlots(m: Mask, n: number, seed: number, iterations: number): Slots {
  const key = `${n}|${seed}|${iterations}`;
  let per = slotCache.get(m);
  const hit = per?.get(key);
  if (hit) return hit;
  const { comps } = labelComponents(m);
  const counts = allocate(comps.map((c) => c.length), n);
  const rng = mulberry32(seed);
  const flat: number[] = [];
  comps.forEach((comp, ci) => { if (counts[ci] > 0) lloydComponent(m, comp, counts[ci], iterations, rng, flat); });
  const slots: Slots = { x: new Float64Array(n), y: new Float64Array(n) };
  for (let i = 0; i < n; i++) { slots.x[i] = flat[2 * i]; slots.y[i] = flat[2 * i + 1]; }
  if (!per) slotCache.set(m, (per = new Map()));
  per.set(key, slots);
  return slots;
}

function meanNearest(x: Float64Array, y: Float64Array): number {
  const n = x.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = (x[i] - x[j]) ** 2 + (y[i] - y[j]) ** 2;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / n;
}

// ------------------------------------------------------------------ layout

function fallbackResult(photos: PhotoBase[], connections: Connection[], mask: Mask, why: 'empty-mask' | 'too-thin'): ShapedLayoutResult {
  const positions = computeLayout(photos, connections);
  const s = layoutStats(photos, connections, positions);
  return { positions, mask, frame: null, stats: s, organicStats: s, ratio: 1, fallback: why };
}

function seedTransforms(sx: Float64Array, sy: Float64Array, tx: Float64Array, ty: Float64Array, d: number): { x: Float64Array; y: Float64Array } {
  // dihedral d in 0..7: 4 rotations x mirror, about the seed centroid; then per-axis affine to the slot cloud
  const n = sx.length;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += sx[i]; cy += sy[i]; }
  cx /= n; cy /= n;
  const ax = new Float64Array(n), ay = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let x = sx[i] - cx, y = sy[i] - cy;
    if (d >= 4) x = -x;
    for (let r = 0; r < (d & 3); r++) { const t = x; x = -y; y = t; }
    ax[i] = x; ay[i] = y;
  }
  const stat = (a: Float64Array) => {
    let m = 0;
    for (let i = 0; i < n; i++) m += a[i];
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (a[i] - m) ** 2;
    return { m, sd: Math.sqrt(v / n) };
  };
  const sa = stat(ax), sb = stat(ay), ta = stat(tx), tb = stat(ty);
  const kx = sa.sd > 1e-9 ? ta.sd / sa.sd : 1, ky = sb.sd > 1e-9 ? tb.sd / sb.sd : 1;
  const ox = new Float64Array(n), oy = new Float64Array(n);
  for (let i = 0; i < n; i++) { ox[i] = ta.m + (ax[i] - sa.m) * kx; oy[i] = tb.m + (ay[i] - sb.m) * ky; }
  return { x: ox, y: oy };
}

function countOutside(m: Mask, px: Float64Array, py: Float64Array, frame: MaskFrame, tol: number): number {
  const { width: W, height: H, data } = m;
  const tolMask = tol / frame.scale;
  let out = 0;
  for (let i = 0; i < px.length; i++) {
    const mx = (px[i] - frame.x0) / frame.scale, my = (py[i] - frame.y0) / frame.scale;
    const ix = Math.floor(mx), iy = Math.floor(my);
    if (ix >= 0 && iy >= 0 && ix < W && iy < H && data[iy * W + ix]) continue;
    let best = Infinity;
    for (let j = 0; j < H; j++)
      for (let k = 0; k < W; k++) {
        if (!data[j * W + k]) continue;
        const dx = Math.max(Math.abs(mx - (k + 0.5)) - 0.5, 0), dy = Math.max(Math.abs(my - (j + 0.5)) - 0.5, 0);
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
    if (Math.sqrt(best) > tolMask) out++;
  }
  return out;
}

export function computeShapedLayout(
  photos: PhotoBase[],
  connections: Connection[],
  mask: Mask,
  opts: ShapedLayoutOptions = {},
): ShapedLayoutResult {
  const seed = opts.seed ?? 1;
  const iterations = opts.iterations ?? 30;
  const spacing = opts.spacing ?? 320;
  const lambda = opts.seedWeight ?? 0.15;
  const maxSwapPasses = opts.maxSwapPasses ?? 40;
  const maxResolvePasses = opts.maxResolvePasses ?? 500;
  const n = photos.length;

  if (n === 0) {
    const empty = { avgConnectionLength: 0, overlaps: 0, outside: 0 };
    return { positions: new Map(), mask, frame: null, stats: empty, organicStats: empty, ratio: 1, fallback: null };
  }

  // 1. normalize
  const m = normalizeMask(mask, MASK_SIZE, n);
  const area = maskArea(m);
  if (area === 0) return fallbackResult(photos, connections, m, 'empty-mask');
  if (area < 6 * n) return fallbackResult(photos, connections, m, 'too-thin');

  // 2-3. slots and scale
  const slots = computeSlots(m, n, seed, iterations);
  const meanNN = n >= 2 ? meanNearest(slots.x, slots.y) : 1.075 * Math.sqrt(area);
  const scale = spacing / meanNN;
  const tx = new Float64Array(n), ty = new Float64Array(n);
  for (let i = 0; i < n; i++) { tx[i] = slots.x[i] * scale; ty[i] = slots.y[i] * scale; }

  // 4. seed from the organic layout, best of 8 orientations
  const organic = computeLayout(photos, connections);
  const ox = new Float64Array(n), oy = new Float64Array(n);
  photos.forEach((p, i) => { const q = organic.get(p.id)!; ox[i] = q.x; oy[i] = q.y; });
  let bestCost = Infinity, bestSeed = seedTransforms(ox, oy, tx, ty, 0);
  let bestAssign: Int32Array = new Int32Array(n);
  for (let d = 0; d < 8; d++) {
    const s = seedTransforms(ox, oy, tx, ty, d);
    const cost = new Float64Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) cost[i * n + j] = (s.x[i] - tx[j]) ** 2 + (s.y[i] - ty[j]) ** 2;
    const a = hungarian(cost, n);
    let total = 0;
    for (let i = 0; i < n; i++) total += cost[i * n + a[i]];
    if (total < bestCost) { bestCost = total; bestSeed = s; bestAssign = a; }
  }

  // 5. refine by pairwise swaps
  const index = new Map(photos.map((p, i) => [p.id, i]));
  const adj: { o: number; w: number }[][] = photos.map(() => []);
  for (const c of connections) {
    const a = index.get(c.source), b = index.get(c.target);
    if (a === undefined || b === undefined) continue;
    const w = 0.5 + 0.5 * c.strength;
    adj[a].push({ o: b, w });
    adj[b].push({ o: a, w });
  }
  const px = new Float64Array(n), py = new Float64Array(n);
  for (let i = 0; i < n; i++) { px[i] = tx[bestAssign[i]]; py[i] = ty[bestAssign[i]]; }
  const sxs = bestSeed.x, sys = bestSeed.y;
  const inv = 1 / (spacing * spacing);
  // energy of photo i placed at (x, y), edges to j excluded
  const local = (i: number, x: number, y: number, skip: number) => {
    let e = 0;
    for (const { o, w } of adj[i]) if (o !== skip) e += w * ((x - px[o]) ** 2 + (y - py[o]) ** 2);
    return e + lambda * ((x - sxs[i]) ** 2 + (y - sys[i]) ** 2);
  };
  for (let pass = 0; pass < maxSwapPasses; pass++) {
    let swaps = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const before = local(i, px[i], py[i], j) + local(j, px[j], py[j], i);
        const after = local(i, px[j], py[j], j) + local(j, px[i], py[i], i);
        if ((after - before) * inv < -1e-9) {
          const x = px[i], y = py[i];
          px[i] = px[j]; py[i] = py[j]; px[j] = x; py[j] = y;
          swaps++;
        }
      }
    if (swaps === 0) break;
  }

  // 6. clean up: resolve real boxes, recenter, round
  const w = new Float64Array(n), h = new Float64Array(n);
  photos.forEach((p, i) => { const b = nodeBox(p); w[i] = b.w; h[i] = b.h; });
  resolveCollisions(px, py, w, h, LAYOUT_GAP + 2, maxResolvePasses);
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += px[i]; cy += py[i]; }
  cx /= n; cy /= n;
  for (let i = 0; i < n; i++) { px[i] -= cx; py[i] -= cy; }
  const frame: MaskFrame = { scale, x0: -cx, y0: -cy };
  const positions: Pos = new Map();
  photos.forEach((p, i) => positions.set(p.id, { x: Math.round(px[i]), y: Math.round(py[i]) }));

  const rx = new Float64Array(n), ry = new Float64Array(n);
  photos.forEach((p, i) => { const q = positions.get(p.id)!; rx[i] = q.x; ry[i] = q.y; });
  const stats: LayoutStats = {
    ...layoutStats(photos, connections, positions),
    outside: countOutside(m, rx, ry, frame, 0.25 * spacing),
  };
  const organicStats = layoutStats(photos, connections, organic);
  const ratio = organicStats.avgConnectionLength > 0 ? stats.avgConnectionLength / organicStats.avgConnectionLength : 1;
  return { positions, mask: m, frame, stats, organicStats, ratio, fallback: null };
}
