import type { Connection, Photo } from '../types';
import { deltaE, hexToLab, type Lab } from './color';

/** A photo before layout (no x/y yet). */
export type PhotoBase = Omit<Photo, 'x' | 'y'>;

export const MIN_DEGREE = 2;
export const MAX_DEGREE = 5;

const BRIGHTNESS_WEIGHT = 20; // deltaE-equivalent points for a full 0..1 brightness difference
const STRENGTH_SCALE = 30; // distance at which strength falls to 1/e

interface LabColor {
  lab: Lab;
  weight: number;
}

const labCache = new Map<string, Lab>();
function labOf(hex: string): Lab {
  let l = labCache.get(hex);
  if (!l) {
    l = hexToLab(hex);
    labCache.set(hex, l);
  }
  return l;
}

function directed(a: LabColor[], b: LabColor[]): number {
  let s = 0;
  for (const ca of a) {
    let best = Infinity;
    for (const cb of b) best = Math.min(best, deltaE(ca.lab, cb.lab));
    s += ca.weight * best;
  }
  return s;
}

/**
 * Palette distance: for each color in A the nearest color in B (Lab deltaE),
 * weighted by A's weight; symmetrized by averaging A->B and B->A; plus
 * 20 * |brightness difference|.
 */
export function paletteDistance(a: PhotoBase, b: PhotoBase): number {
  const pa = a.colors.map((c) => ({ lab: labOf(c.hex), weight: c.weight }));
  const pb = b.colors.map((c) => ({ lab: labOf(c.hex), weight: c.weight }));
  return (directed(pa, pb) + directed(pb, pa)) / 2 + BRIGHTNESS_WEIGHT * Math.abs(a.brightness - b.brightness);
}

/** Absolute strength: exp(-distance / 30), 1 = most similar, rounded to 2 decimals. */
export function strengthFromDistance(d: number): number {
  return Math.round(Math.exp(-d / STRENGTH_SCALE) * 100) / 100;
}

const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/**
 * Build connections. Steps: per-photo top-k, symmetric union, cap degree at 5
 * (dropping the weakest edges, never taking a node below 2), top up nodes with
 * fewer than 2, and bridge components with the strongest available edge.
 */
export function buildConnections(photos: PhotoBase[], k = 3): Connection[] {
  const n = photos.length;
  if (n < 2) return [];
  k = Math.max(2, Math.min(5, Math.round(k)));

  // distance matrix; sortable pair list with deterministic tie-breaks
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) dist[i][j] = dist[j][i] = paletteDistance(photos[i], photos[j]);
  const ranked = (i: number) =>
    photos
      .map((_, j) => j)
      .filter((j) => j !== i)
      .sort((p, q) => dist[i][p] - dist[i][q] || (photos[p].id < photos[q].id ? -1 : 1));

  const edges = new Map<string, [number, number]>(); // key -> [i, j]
  const deg = new Array(n).fill(0);
  const add = (i: number, j: number) => {
    const kk = key(photos[i].id, photos[j].id);
    if (edges.has(kk)) return false;
    edges.set(kk, [i, j]);
    deg[i]++;
    deg[j]++;
    return true;
  };
  const remove = (i: number, j: number) => {
    edges.delete(key(photos[i].id, photos[j].id));
    deg[i]--;
    deg[j]--;
  };
  const has = (i: number, j: number) => edges.has(key(photos[i].id, photos[j].id));

  for (let i = 0; i < n; i++) for (const j of ranked(i).slice(0, k)) add(i, j);

  // cap degree: weakest first; never take an endpoint below MIN_DEGREE
  const byWeakest = () =>
    [...edges.values()].sort((a, b) => dist[b[0]][b[1]] - dist[a[0]][a[1]] || a[0] - b[0] || a[1] - b[1]);
  for (const [i, j] of byWeakest()) {
    if ((deg[i] > MAX_DEGREE || deg[j] > MAX_DEGREE) && deg[i] > MIN_DEGREE && deg[j] > MIN_DEGREE) remove(i, j);
  }

  // min degree: connect to the closest partner, preferring partners with room
  const minDeg = Math.min(MIN_DEGREE, n - 1);
  for (let i = 0; i < n; i++) {
    const order = ranked(i).filter((j) => !has(i, j));
    const room = order.filter((j) => deg[j] < MAX_DEGREE);
    for (const j of [...room, ...order.filter((j) => deg[j] >= MAX_DEGREE)]) {
      if (deg[i] >= minDeg) break;
      add(i, j);
    }
  }

  // connectivity: bridge components with the strongest edge, preferring nodes with room
  for (;;) {
    const comp = components(n, edges);
    if (new Set(comp).size <= 1) break;
    let best: [number, number] | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (comp[i] === comp[j]) continue;
        const over = (deg[i] >= MAX_DEGREE ? 1 : 0) + (deg[j] >= MAX_DEGREE ? 1 : 0);
        const score = over * 1e6 + dist[i][j];
        if (score < bestScore) {
          bestScore = score;
          best = [i, j];
        }
      }
    if (!best) break;
    add(best[0], best[1]);
  }

  return [...edges.values()]
    .map(([i, j]) => {
      const [s, t] = photos[i].id < photos[j].id ? [photos[i].id, photos[j].id] : [photos[j].id, photos[i].id];
      return { source: s, target: t, type: 'color' as const, strength: strengthFromDistance(dist[i][j]) };
    })
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.target < b.target ? -1 : 1));
}

function components(n: number, edges: Map<string, [number, number]>): number[] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [i, j] of edges.values()) parent[find(i)] = find(j);
  return parent.map((_, i) => find(i));
}

export function degrees(photos: { id: string }[], connections: Connection[]): Map<string, number> {
  const m = new Map(photos.map((p) => [p.id, 0]));
  for (const c of connections) {
    m.set(c.source, (m.get(c.source) ?? 0) + 1);
    m.set(c.target, (m.get(c.target) ?? 0) + 1);
  }
  return m;
}

/** Check every contract rule from src/types.ts. Returns human-readable errors (empty = valid). */
export function validateDataset(photos: Photo[], connections: Connection[]): string[] {
  const errs: string[] = [];
  const HEX = /^#[0-9a-f]{6}$/;
  const ids = new Set<string>();
  const dec = (v: number, d: number) => Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) < 1e-6;

  if (photos.length === 0) errs.push('There are no photos.');
  for (const p of photos) {
    if (ids.has(p.id)) errs.push(`${p.id}: duplicate id`);
    ids.add(p.id);
    if (!/^\d{3,}-[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) errs.push(`${p.id}: id must look like "001-slug"`);
    for (const s of [p.src.sm, p.src.lg])
      if (!s || s.startsWith('/') || !s.startsWith('photos/')) errs.push(`${p.id}: src "${s}" must be "photos/..." with no leading slash`);
    if (!(p.width > 0 && p.height > 0)) errs.push(`${p.id}: width/height must be positive`);
    else if (Math.abs(p.aspect - p.width / p.height) > 0.01) errs.push(`${p.id}: aspect is not width / height`);
    if (p.colors.length < 3 || p.colors.length > 5) errs.push(`${p.id}: needs 3 to 5 colors (has ${p.colors.length})`);
    let sum = 0;
    p.colors.forEach((c, i) => {
      if (!HEX.test(c.hex)) errs.push(`${p.id}: bad hex "${c.hex}"`);
      if (i > 0 && c.weight > p.colors[i - 1].weight) errs.push(`${p.id}: colors are not sorted by weight`);
      sum += c.weight;
    });
    if (Math.abs(sum - 1) > 0.0005) errs.push(`${p.id}: color weights sum to ${sum.toFixed(3)}, not 1`);
    for (const [name, v] of [['brightness', p.brightness], ['saturation', p.saturation]] as const)
      if (!(v >= 0 && v <= 1)) errs.push(`${p.id}: ${name} out of 0..1`);
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) errs.push(`${p.id}: x/y must be integers`);
  }

  const seen = new Set<string>();
  const deg = new Map<string, number>();
  const edgesMap = new Map<string, [number, number]>();
  const idx = new Map([...ids].map((id, i) => [id, i]));
  for (const c of connections) {
    const label = `${c.source} - ${c.target}`;
    if (c.type !== 'color') errs.push(`${label}: type must be "color"`);
    if (c.source === c.target) errs.push(`${label}: self-loop`);
    if (!(c.source < c.target)) errs.push(`${label}: source must sort before target`);
    if (!ids.has(c.source) || !ids.has(c.target)) errs.push(`${label}: refers to a missing photo`);
    if (seen.has(key(c.source, c.target))) errs.push(`${label}: duplicate connection`);
    seen.add(key(c.source, c.target));
    if (!(c.strength >= 0 && c.strength <= 1) || !dec(c.strength, 2)) errs.push(`${label}: strength must be 0..1 with 2 decimals`);
    deg.set(c.source, (deg.get(c.source) ?? 0) + 1);
    deg.set(c.target, (deg.get(c.target) ?? 0) + 1);
    const i = idx.get(c.source), j = idx.get(c.target);
    if (i !== undefined && j !== undefined) edgesMap.set(key(c.source, c.target), [i, j]);
  }
  const need = Math.min(MIN_DEGREE, photos.length - 1);
  for (const p of photos) {
    const d = deg.get(p.id) ?? 0;
    if (d < need || d > MAX_DEGREE) errs.push(`${p.id}: has ${d} connections (needs ${need} to ${MAX_DEGREE})`);
  }
  if (photos.length > 1 && new Set(components(photos.length, edgesMap)).size > 1)
    errs.push('The connections do not form one connected graph.');
  return errs;
}
