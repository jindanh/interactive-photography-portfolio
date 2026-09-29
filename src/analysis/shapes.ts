/**
 * Shape masks for the shaped (non-organic) layouts. Pure math: no DOM, canvas,
 * Path2D or ImageData constructor, so everything here runs in Node.
 */

/**
 * Binary mask. Masks are treated as IMMUTABLE once created: the WeakMap/Map caches
 * below (normalizeMask, shapeMask) key on the object and would go stale if a caller
 * mutated `data` in place. Make a new Mask instead.
 * Row-major, row 0 = TOP (+y down, same as world). Pixel (i,j) covers [i,i+1)x[j,j+1).
 */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array; // length width*height; 1 = inside, 0 = outside
}

/** Long side used for layout (built-ins are rasterized at this size). */
export const MASK_SIZE = 160;

export type ShapeId = 'flower' | 'umbrella' | 'heart' | 'circle';
type Op = { op?: 'add' | 'sub' }; // default 'add'; parts are applied in order
type Pts = readonly (readonly [number, number])[];
export type ShapePart =
  | (Op & { kind: 'circle'; cx: number; cy: number; r: number })
  | (Op & { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotate?: number /* degrees */ })
  | (Op & { kind: 'polygon'; points: Pts }) // even-odd
  | (Op & { kind: 'stroke'; points: Pts; width: number }); // polyline capsule
export interface ShapeDef {
  id: ShapeId;
  label: string;
  viewBox: { width: number; height: number }; // y down
  parts: readonly ShapePart[];
}

// ---------------------------------------------------------------- built-ins
// Designed for ~45 photos. With n slots the slot unit is s ~ 0.16 * sqrt(area),
// which puts the flower at s ~ 10 viewBox units, the umbrella at ~ 10.5 and the
// heart / circle at ~ 14. Feature sizes below follow the rules in the spec
// (strokes >= 1.2 s, petals >= 2 s wide, notches >= 1 s deep).

function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function flowerParts(): ShapePart[] {
  // Five clearly separate petals (centres 30 from the head), no leaf.
  const parts: ShapePart[] = [];
  const hx = 50, hy = 45;
  for (let k = 0; k < 5; k++) {
    const deg = -90 + 72 * k;
    const a = (deg * Math.PI) / 180;
    parts.push({ kind: 'ellipse', cx: hx + 30 * Math.cos(a), cy: hy + 30 * Math.sin(a), rx: 16, ry: 10.5, rotate: deg });
  }
  parts.push({ kind: 'circle', cx: hx, cy: hy, r: 12 });
  // Stem starts just under the lower petals: top = 45 + 30 cos(36deg) + 4 = 73.27, then 6 up / 45 down.
  const top = hy + 30 * Math.cos(Math.PI / 5) + 4;
  parts.push({ kind: 'stroke', points: [[50, top - 6], [50, top + 45]], width: 11 });
  return parts;
}

function umbrellaParts(): ShapePart[] {
  return [
    { kind: 'ellipse', cx: 50, cy: 44, rx: 48, ry: 36 },
    { kind: 'polygon', op: 'sub', points: [[-10, 44], [110, 44], [110, 100], [-10, 100]] },
    { kind: 'ellipse', cx: 18, cy: 44, rx: 16, ry: 11 },
    { kind: 'ellipse', cx: 50, cy: 44, rx: 16, ry: 11 },
    { kind: 'ellipse', cx: 82, cy: 44, rx: 16, ry: 11 },
    { kind: 'stroke', points: [[50, 44], [50, 110]], width: 12.5 },
    { kind: 'stroke', points: arc(36, 110, 14, 0, 180, 24), width: 12.5 },
  ];
}

function heartParts(): ShapePart[] {
  const k = 3.2, pts: [number, number][] = [];
  const steps = 180;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([51.2 + x * k, (12.2 - y) * k]);
  }
  // Narrow wedge cut from the top edge: a clear cleft (about 2.7 slot units deep).
  return [{ kind: 'polygon', points: pts }, { kind: 'polygon', op: 'sub', points: [[42.2, 0], [60.2, 0], [51.2, 38]] }];
}

export const BUILTIN_SHAPES: readonly ShapeDef[] = [
  { id: 'flower', label: 'Flower', viewBox: { width: 100, height: 126.2705 }, parts: flowerParts() },
  { id: 'umbrella', label: 'Umbrella', viewBox: { width: 100, height: 132 }, parts: umbrellaParts() },
  { id: 'heart', label: 'Heart', viewBox: { width: 103, height: 94 }, parts: heartParts() },
  { id: 'circle', label: 'Circle', viewBox: { width: 100, height: 100 }, parts: [{ kind: 'circle', cx: 50, cy: 50, r: 50 }] },
];

// -------------------------------------------------------------- rasterizing

function inPart(p: ShapePart, x: number, y: number): boolean {
  switch (p.kind) {
    case 'circle': {
      const dx = x - p.cx, dy = y - p.cy;
      return dx * dx + dy * dy <= p.r * p.r;
    }
    case 'ellipse': {
      const a = ((p.rotate ?? 0) * Math.PI) / 180;
      const c = Math.cos(a), s = Math.sin(a);
      const dx = x - p.cx, dy = y - p.cy;
      const u = (dx * c + dy * s) / p.rx, v = (-dx * s + dy * c) / p.ry;
      return u * u + v * v <= 1;
    }
    case 'polygon': {
      const pts = p.points;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    case 'stroke': {
      const pts = p.points, r2 = (p.width / 2) * (p.width / 2);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const abx = bx - ax, aby = by - ay;
        const len2 = abx * abx + aby * aby;
        let t = len2 === 0 ? 0 : ((x - ax) * abx + (y - ay) * aby) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (ax + abx * t), dy = y - (ay + aby * t);
        if (dx * dx + dy * dy <= r2) return true;
      }
      return pts.length === 1 && (x - pts[0][0]) ** 2 + (y - pts[0][1]) ** 2 <= r2;
    }
  }
}

/** Pixel-centre sampling, 1 sample per pixel, uniform scale (long side = longSide). */
export function rasterizeShape(def: ShapeDef, longSide: number = MASK_SIZE): Mask {
  const { width: vw, height: vh } = def.viewBox;
  const k = longSide / Math.max(vw, vh);
  const width = Math.max(1, Math.round(vw * k)), height = Math.max(1, Math.round(vh * k));
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / k, y = (j + 0.5) / k;
      let inside = false;
      for (const part of def.parts) {
        const hit = inPart(part, x, y);
        if (part.op === 'sub') {
          if (hit) inside = false;
        } else if (hit) inside = true;
      }
      data[j * width + i] = inside ? 1 : 0;
    }
  return { width, height, data };
}

// Cache of built-in masks; entries are never mutated or invalidated (masks are immutable).
const builtinCache = new Map<ShapeId, Mask>();
/** Memoized rasterization of a built-in shape at MASK_SIZE. Same object for the same id. */
export function shapeMask(id: ShapeId): Mask {
  let m = builtinCache.get(id);
  if (!m) {
    const def = BUILTIN_SHAPES.find((d) => d.id === id);
    if (!def) throw new Error(`Unknown shape: ${id}`);
    m = rasterizeShape(def, MASK_SIZE);
    builtinCache.set(id, m);
  }
  return m;
}

// -------------------------------------------------------- image -> mask

/**
 * hasTransparency = at least 1% of pixels have alpha < 250. If so inside =
 * alpha >= 128; otherwise inside = luma < 128 (dark on light). invert flips.
 */
export function maskFromImageData(
  img: { width: number; height: number; data: Uint8ClampedArray },
  opts?: { invert?: boolean },
): Mask {
  const { width, height, data } = img;
  const total = width * height;
  const out = new Uint8Array(total);
  let translucent = 0;
  for (let i = 0; i < total; i++) if (data[i * 4 + 3] < 250) translucent++;
  const hasTransparency = total > 0 && translucent >= 0.01 * total;
  const inv = !!opts?.invert;
  for (let i = 0; i < total; i++) {
    let inside: boolean;
    if (hasTransparency) inside = data[i * 4 + 3] >= 128;
    else inside = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2] < 128;
    out[i] = inside !== inv ? 1 : 0;
  }
  return { width, height, data: out };
}

export function maskArea(mask: Mask): number {
  let a = 0;
  const d = mask.data;
  for (let i = 0; i < d.length; i++) a += d[i];
  return a;
}

// Keyed by mask object identity; valid only because masks are immutable.
const normCache = new WeakMap<Mask, Map<string, Mask>>();

/**
 * Crop to the inside bbox, pad 2 px, nearest-resample so the long side = maxSide,
 * and drop 4-connected components with area < 0.5 * (insideArea / n) when n is
 * given. Holes are kept. Memoized per (input mask, maxSide, n): the result is the
 * same object for the same arguments. An empty mask normalizes to an empty 1x1 mask.
 */
export function normalizeMask(mask: Mask, maxSide: number = MASK_SIZE, n?: number): Mask {
  const key = `${maxSide}|${n ?? ''}`;
  let per = normCache.get(mask);
  const hit = per?.get(key);
  if (hit) return hit;
  const res = normalizeUncached(mask, maxSide, n);
  if (!per) normCache.set(mask, (per = new Map()));
  per.set(key, res);
  return res;
}

function normalizeUncached(mask: Mask, maxSide: number, n?: number): Mask {
  const { width: W, height: H, data } = mask;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++)
      if (data[j * W + i]) {
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        if (j > y1) y1 = j;
      }
  if (x1 < 0) return { width: 1, height: 1, data: new Uint8Array(1) };
  const PAD = 2;
  const bw = x1 - x0 + 1 + 2 * PAD, bh = y1 - y0 + 1 + 2 * PAD;
  const k = maxSide / Math.max(bw, bh);
  const nw = Math.max(1, Math.round(bw * k)), nh = Math.max(1, Math.round(bh * k));
  const out = new Uint8Array(nw * nh);
  for (let j = 0; j < nh; j++) {
    const sy = Math.min(bh - 1, Math.floor((j + 0.5) / k)) - PAD + y0;
    if (sy < 0 || sy >= H) continue;
    for (let i = 0; i < nw; i++) {
      const sx = Math.min(bw - 1, Math.floor((i + 0.5) / k)) - PAD + x0;
      if (sx >= 0 && sx < W && data[sy * W + sx]) out[j * nw + i] = 1;
    }
  }
  const res: Mask = { width: nw, height: nh, data: out };
  if (n !== undefined && n > 0) {
    const min = 0.5 * (maskArea(res) / n);
    for (const comp of labelComponents(res).comps) if (comp.length < min) for (const p of comp) out[p] = 0;
  }
  return res;
}

/** 4-connected components of the inside pixels, in scan order; each is a list of pixel indices. */
export function labelComponents(mask: Mask): { comps: number[][]; label: Int32Array } {
  const { width: W, height: H, data } = mask;
  const label = new Int32Array(W * H).fill(-1);
  const comps: number[][] = [];
  const stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!data[s] || label[s] >= 0) continue;
    const id = comps.length, comp: number[] = [];
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      comp.push(p);
      const x = p % W, y = (p - x) / W;
      if (x > 0 && data[p - 1] && label[p - 1] < 0) { label[p - 1] = id; stack.push(p - 1); }
      if (x < W - 1 && data[p + 1] && label[p + 1] < 0) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && data[p - W] && label[p - W] < 0) { label[p - W] = id; stack.push(p - W); }
      if (y < H - 1 && data[p + W] && label[p + W] < 0) { label[p + W] = id; stack.push(p + W); }
    }
    comp.sort((a, b) => a - b);
    comps.push(comp);
  }
  return { comps, label };
}

// -------------------------------------------------------------- persistence

const MAX_DIM = 4096;

/** Bit-packed (MSB first, row-major) and base64. Format "w,h,base64". */
export function encodeMask(mask: Mask): string {
  const total = mask.width * mask.height;
  const bytes = new Uint8Array(Math.ceil(total / 8));
  for (let i = 0; i < total; i++) if (mask.data[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `${mask.width},${mask.height},${btoa(bin)}`;
}

/** Inverse of encodeMask; null on any malformed input. */
export function decodeMask(s: string): Mask | null {
  try {
    if (typeof s !== 'string') return null;
    const m = /^(\d{1,4}),(\d{1,4}),([A-Za-z0-9+/]*={0,2})$/.exec(s);
    if (!m) return null;
    const width = Number(m[1]), height = Number(m[2]);
    if (width < 1 || height < 1 || width > MAX_DIM || height > MAX_DIM) return null;
    const total = width * height;
    const bin = atob(m[3]);
    if (bin.length !== Math.ceil(total / 8)) return null;
    const data = new Uint8Array(total);
    for (let i = 0; i < total; i++) data[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
    // padding bits in the last byte must be zero so the round trip is exact
    for (let i = total; i < bin.length * 8; i++) if ((bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1) return null;
    return { width, height, data };
  } catch {
    return null;
  }
}

/** RGBA pixels for thumbnails and the underlay (inside = rgba, outside = transparent). */
export function maskToRGBA(mask: Mask, rgba: readonly [number, number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let i = 0; i < mask.data.length; i++)
    if (mask.data[i]) {
      out[i * 4] = rgba[0];
      out[i * 4 + 1] = rgba[1];
      out[i * 4 + 2] = rgba[2];
      out[i * 4 + 3] = rgba[3];
    }
  return out;
}
