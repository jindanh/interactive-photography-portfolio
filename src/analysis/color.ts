import type { PaletteColor } from '../types';

export type Lab = [number, number, number];

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- sRGB <-> CIELAB (D65) ----

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const unlin = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const finv = (t: number) => (t * t * t > EPS ? t * t * t : (116 * t - 16) / KAPPA);

export function rgbToLab(r: number, g: number, b: number): Lab {
  const rl = lin(r), gl = lin(g), bl = lin(b);
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / XN;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / YN;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / ZN;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = finv(fx) * XN, y = finv(fy) * YN, z = finv(fz) * ZN;
  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [unlin(rl), unlin(gl), unlin(bl)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

/** CIE76 color difference. */
export function deltaE(p: Lab, q: Lab): number {
  const dl = p[0] - q[0], da = p[1] - q[1], db = p[2] - q[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** Hue angle in degrees (0..360) of a Lab color, and its chroma. */
export function labHueChroma(lab: Lab): { hue: number; chroma: number } {
  const hue = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  return { hue: (hue + 360) % 360, chroma: Math.hypot(lab[1], lab[2]) };
}

// ---- Palette ----

const MERGE_DELTA_E = 8;
const MIN_WEIGHT = 0.04;

interface Cluster {
  lab: Lab;
  weight: number;
}

function labPoints(data: ImageData): Lab[] {
  const pts: Lab[] = [];
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    pts.push(rgbToLab(d[i], d[i + 1], d[i + 2]));
  }
  return pts;
}

function kmeans(pts: Lab[], k: number, iterations: number): Cluster[] {
  const rand = mulberry32(20240607);
  k = Math.min(k, pts.length);
  // k-means++ seeding
  const centers: Lab[] = [pts[Math.floor(rand() * pts.length)].slice() as Lab];
  const dist2 = new Float64Array(pts.length).fill(Infinity);
  while (centers.length < k) {
    const c = centers[centers.length - 1];
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const d = deltaE(pts[i], c);
      dist2[i] = Math.min(dist2[i], d * d);
      total += dist2[i];
    }
    if (total === 0) break;
    let r = rand() * total;
    let pick = pts.length - 1;
    for (let i = 0; i < pts.length; i++) {
      r -= dist2[i];
      if (r <= 0) { pick = i; break; }
    }
    centers.push(pts[pick].slice() as Lab);
  }
  const assign = new Int32Array(pts.length);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < pts.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = deltaE(pts[i], centers[c]);
        if (d < bd) { bd = d; best = c; }
      }
      assign[i] = best;
      const s = sums[best];
      s[0] += pts[i][0]; s[1] += pts[i][1]; s[2] += pts[i][2]; s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      const s = sums[c];
      if (s[3] > 0) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    }
  }
  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < pts.length; i++) counts[assign[i]]++;
  return centers
    .map((lab, c) => ({ lab, weight: counts[c] / pts.length }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

function clusterHex(lab: Lab): string {
  return rgbToHex(...labToRgb(lab[0], lab[1], lab[2]));
}

/**
 * Palette from a ~64px downsampled image: k-means (k=5, 12 iterations,
 * k-means++ seeding with a fixed PRNG seed) in CIELAB. Clusters closer than
 * deltaE 8 are merged, clusters under 4% weight are dropped (a flat image is
 * padded with lighter/darker variants so there are always 3..5 colors).
 * Weights are rounded to 3 decimals and sum to exactly 1 (residual goes on the
 * largest); sorted descending; hex is lowercase "#rrggbb".
 */
export function extractPalette(data: ImageData, k = 5, iterations = 12): PaletteColor[] {
  const pts = labPoints(data);
  if (pts.length === 0) return [{ hex: '#808080', weight: 1 }];
  const raw = kmeans(pts, k, iterations);

  // merge near-duplicates (greedy, heaviest first)
  const merged: Cluster[] = [];
  for (const c of raw) {
    const m = merged.find((x) => deltaE(x.lab, c.lab) < MERGE_DELTA_E);
    if (m) {
      const w = m.weight + c.weight;
      m.lab = [
        (m.lab[0] * m.weight + c.lab[0] * c.weight) / w,
        (m.lab[1] * m.weight + c.lab[1] * c.weight) / w,
        (m.lab[2] * m.weight + c.lab[2] * c.weight) / w,
      ];
      m.weight = w;
    } else merged.push({ lab: c.lab, weight: c.weight });
  }
  merged.sort((a, b) => b.weight - a.weight);
  let kept = merged.filter((c) => c.weight >= MIN_WEIGHT);
  if (kept.length === 0) kept = [merged[0]];

  // Pad to a minimum of 3 colors for very flat images.
  for (const c of raw) {
    if (kept.length >= 3) break;
    if (!kept.some((x) => deltaE(x.lab, c.lab) < 1)) kept.push({ ...c });
  }
  const base = kept[0].lab;
  const variants: Lab[] = [
    [Math.min(100, base[0] + 12), base[1], base[2]],
    [Math.max(0, base[0] - 12), base[1], base[2]],
  ];
  let vi = 0;
  while (kept.length < 3) kept.push({ lab: variants[vi++ % 2], weight: 0.02 });
  kept = kept.slice(0, 5);

  const total = kept.reduce((s, c) => s + c.weight, 0);
  const out = kept
    .map((c) => ({ hex: clusterHex(c.lab), weight: Math.round((c.weight / total) * 1000) / 1000 }))
    .sort((a, b) => b.weight - a.weight);
  const sum = out.reduce((s, c) => s + c.weight, 0);
  out[0].weight = Math.round((out[0].weight + (1 - sum)) * 1000) / 1000;
  return out;
}

/** Brightness = mean CIELAB L* over all pixels, divided by 100 (0..1). */
export function brightnessOf(data: ImageData): number {
  const d = data.data;
  let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    s += rgbToLab(d[i], d[i + 1], d[i + 2])[0];
    n++;
  }
  return n ? Math.round((s / n / 100) * 1000) / 1000 : 0;
}

/** Saturation = mean HSV saturation, S = (max - min) / max (0 when max = 0). */
export function saturationOf(data: ImageData): number {
  const d = data.data;
  let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]);
    const mn = Math.min(d[i], d[i + 1], d[i + 2]);
    s += mx === 0 ? 0 : (mx - mn) / mx;
    n++;
  }
  return n ? Math.round((s / n) * 1000) / 1000 : 0;
}
