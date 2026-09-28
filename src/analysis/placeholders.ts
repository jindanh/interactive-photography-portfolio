import { mulberry32 } from './color';

type Group = 'blue' | 'warm' | 'green' | 'red' | 'neutral';

// Deliberately clustered palettes: several of each family.
const SLUGS: [Group, string][] = [
  ['blue', 'harbor'], ['blue', 'tide'], ['blue', 'dusk'], ['blue', 'glacier'],
  ['blue', 'lagoon'], ['blue', 'indigo'], ['blue', 'rain'], ['blue', 'bluehour'],
  ['warm', 'straw'], ['warm', 'ember'], ['warm', 'lantern'], ['warm', 'amber'],
  ['warm', 'dune'], ['warm', 'honey'], ['warm', 'marigold'], ['warm', 'sunroom'], ['warm', 'harvest'],
  ['green', 'fern'], ['green', 'moss'], ['green', 'canopy'], ['green', 'meadow'],
  ['green', 'pine'], ['green', 'sage'], ['green', 'lichen'], ['green', 'orchard'],
  ['red', 'poppy'], ['red', 'blush'], ['red', 'coral'], ['red', 'brick'],
  ['red', 'rosehip'], ['red', 'cinder'], ['red', 'peony'], ['red', 'cherry'],
  ['neutral', 'fog'], ['neutral', 'concrete'], ['neutral', 'ash'], ['neutral', 'bone'],
  ['neutral', 'slate'], ['neutral', 'pebble'], ['neutral', 'paper'],
];

const ASPECTS = [3 / 2, 2 / 3, 1, 4 / 5, 3 / 2, 4 / 5, 2 / 3, 3 / 2];
const LONG_EDGE = 1200;

interface Pal {
  sky1: string; sky2: string; mid: string; ground: string; accent: string; dark: string;
}

const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

function palette(group: Group, rand: () => number): Pal {
  const j = (a: number, b: number) => a + (b - a) * rand();
  switch (group) {
    case 'blue': {
      const h = j(200, 235);
      return {
        sky1: hsl(h, j(45, 70), j(60, 78)), sky2: hsl(h + 10, j(40, 60), j(82, 92)),
        mid: hsl(h - 5, j(45, 65), j(38, 52)), ground: hsl(h + 8, j(50, 65), j(22, 34)),
        accent: hsl(h - 15, j(30, 55), j(85, 94)), dark: hsl(h + 10, 55, j(12, 20)),
      };
    }
    case 'warm': {
      const h = j(28, 52);
      return {
        sky1: hsl(h + 6, j(75, 95), j(62, 75)), sky2: hsl(h + 12, j(80, 95), j(80, 90)),
        mid: hsl(h - 6, j(70, 90), j(48, 58)), ground: hsl(h - 14, j(55, 75), j(28, 40)),
        accent: hsl(h + 4, j(85, 100), j(85, 93)), dark: hsl(h - 18, 50, j(15, 22)),
      };
    }
    case 'green': {
      const h = j(90, 150);
      return {
        sky1: hsl(h - 15, j(30, 50), j(70, 82)), sky2: hsl(h - 25, j(35, 55), j(84, 92)),
        mid: hsl(h, j(35, 55), j(36, 50)), ground: hsl(h + 10, j(40, 55), j(20, 30)),
        accent: hsl(h - 30, j(50, 70), j(75, 88)), dark: hsl(h + 15, 45, j(11, 18)),
      };
    }
    case 'red': {
      const h = j(-25, 10);
      return {
        sky1: hsl(h, j(60, 85), j(68, 80)), sky2: hsl(h + 15, j(65, 85), j(82, 92)),
        mid: hsl(h - 5, j(55, 80), j(42, 55)), ground: hsl(h - 10, j(50, 70), j(24, 34)),
        accent: hsl(h + 25, j(70, 95), j(84, 93)), dark: hsl(h - 8, 55, j(14, 21)),
      };
    }
    default: {
      const h = rand() < 0.5 ? j(30, 50) : j(200, 220);
      const s = j(3, 9);
      return {
        sky1: hsl(h, s, j(66, 78)), sky2: hsl(h, s, j(82, 92)),
        mid: hsl(h, s, j(46, 58)), ground: hsl(h, s + 2, j(26, 36)),
        accent: hsl(h, s, j(88, 95)), dark: hsl(h, s + 2, j(12, 20)),
      };
    }
  }
}

function lin(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, ...stops: string[]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string) {
  const g = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ridge(ctx: CanvasRenderingContext2D, w: number, h: number, base: number, amp: number, color: string, rand: () => number) {
  const p1 = rand() * 6, p2 = rand() * 6, f1 = 1 + rand() * 2, f2 = 3 + rand() * 3;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += w / 60) {
    const t = x / w;
    ctx.lineTo(x, base + amp * (Math.sin(t * f1 * Math.PI + p1) * 0.7 + Math.sin(t * f2 * Math.PI + p2) * 0.3));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function scene(ctx: CanvasRenderingContext2D, w: number, h: number, pal: Pal, style: number, rand: () => number) {
  const horizon = h * (0.45 + rand() * 0.2);
  switch (style) {
    case 0: {
      // horizon with a sun
      ctx.fillStyle = lin(ctx, 0, 0, 0, horizon, pal.sky1, pal.sky2);
      ctx.fillRect(0, 0, w, horizon);
      circle(ctx, w * (0.25 + rand() * 0.5), horizon * (0.45 + rand() * 0.3), Math.min(w, h) * (0.12 + rand() * 0.1), pal.accent, pal.sky2);
      ctx.fillStyle = lin(ctx, 0, horizon, 0, h, pal.mid, pal.ground);
      ctx.fillRect(0, horizon, w, h - horizon);
      break;
    }
    case 1: {
      // layered ridges
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, pal.sky2, pal.sky1);
      ctx.fillRect(0, 0, w, h);
      circle(ctx, w * (0.3 + rand() * 0.4), h * (0.22 + rand() * 0.12), Math.min(w, h) * 0.1, pal.accent, pal.sky2);
      ridge(ctx, w, h, h * 0.55, h * 0.08, pal.sky1, rand);
      ridge(ctx, w, h, h * 0.68, h * 0.07, pal.mid, rand);
      ridge(ctx, w, h, h * 0.82, h * 0.05, pal.ground, rand);
      break;
    }
    case 2: {
      // stripes
      const n = 5 + Math.floor(rand() * 6);
      const cols = [pal.sky1, pal.sky2, pal.mid, pal.ground, pal.accent, pal.dark];
      const vertical = rand() < 0.5;
      const len = vertical ? w : h;
      const sizes = Array.from({ length: n }, () => 0.5 + rand());
      const tot = sizes.reduce((a, b) => a + b, 0);
      let pos = 0;
      sizes.forEach((s, i) => {
        const size = (s / tot) * len;
        ctx.fillStyle = cols[Math.floor(rand() * cols.length)] ?? cols[i % cols.length];
        if (vertical) ctx.fillRect(pos, 0, size + 1, h);
        else ctx.fillRect(0, pos, w, size + 1);
        pos += size;
      });
      ctx.fillStyle = lin(ctx, 0, 0, w, h, 'rgba(255,255,255,0.18)', 'rgba(0,0,0,0.25)');
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 3: {
      // gradient field with a big soft circle
      ctx.fillStyle = lin(ctx, 0, 0, w, h, pal.sky1, pal.mid, pal.ground);
      ctx.fillRect(0, 0, w, h);
      circle(ctx, w * (0.3 + rand() * 0.4), h * (0.3 + rand() * 0.4), Math.min(w, h) * (0.25 + rand() * 0.15), pal.accent, 'rgba(255,255,255,0)');
      break;
    }
    default: {
      // color fields with a low horizon and a small dark shape
      ctx.fillStyle = pal.sky2;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, pal.sky1, pal.mid);
      ctx.fillRect(0, h * 0.12, w, h * 0.5);
      ctx.fillStyle = pal.ground;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);
      ctx.fillStyle = pal.dark;
      const bw = w * (0.08 + rand() * 0.1);
      ctx.fillRect(w * (0.15 + rand() * 0.6), h * 0.5, bw, h * 0.12 + rand() * h * 0.1);
      circle(ctx, w * (0.2 + rand() * 0.6), h * 0.3, Math.min(w, h) * 0.07, pal.accent, pal.sky1);
    }
  }
}

function softNoise(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) {
  const nw = Math.round(w / 8), nh = Math.round(h / 8);
  const c = document.createElement('canvas');
  c.width = nw;
  c.height = nh;
  const cx = c.getContext('2d')!;
  const img = cx.createImageData(nw, nh);
  for (let i = 0; i < nw * nh; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 14;
  }
  cx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, w, h);
}

/** Draw ~40 abstract "photographs" and return them as jpg Files (same pipeline as real photos). */
export async function generatePlaceholders(count = 40): Promise<File[]> {
  const rand = mulberry32(777);
  // interleave the groups so ids (001, 002, ...) are not sorted by color
  const order = SLUGS.slice(0, count).map((s, i) => ({ s, k: rand(), i }));
  order.sort((a, b) => a.k - b.k);
  const files: File[] = [];
  for (let n = 0; n < order.length; n++) {
    const [group, slug] = order[n].s;
    const r = mulberry32(1000 + order[n].i * 97);
    const aspect = ASPECTS[Math.floor(r() * ASPECTS.length)];
    const w = aspect >= 1 ? LONG_EDGE : Math.round(LONG_EDGE * aspect);
    const h = aspect >= 1 ? Math.round(LONG_EDGE / aspect) : LONG_EDGE;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    scene(ctx, w, h, palette(group, r), Math.floor(r() * 5), r);
    softNoise(ctx, w, h, r);
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw placeholder'))), 'image/jpeg', 0.92),
    );
    files.push(new File([blob], `${slug}.jpg`, { type: 'image/jpeg' }));
    await new Promise((res) => setTimeout(res));
  }
  return files;
}
