import { useEffect, useRef } from 'react';
import { maskFromImageData, maskToRGBA, shapeMask, type Mask, type ShapeId } from '../analysis/shapes';
import type { ShapeChoice } from './shapeStorage';

export const SHAPE_NAMES: Record<ShapeChoice, string> = {
  organic: 'Organic',
  flower: 'Flower',
  umbrella: 'Umbrella',
  heart: 'Heart',
  circle: 'Circle',
  custom: 'Custom image',
};

const OPTIONS: ShapeChoice[] = ['organic', 'flower', 'umbrella', 'heart', 'circle', 'custom'];
const THUMB = 32;

/** Draws a picked image with its long side at 256 px and turns it into a mask (not inverted). */
export async function maskFromFile(file: File): Promise<Mask> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = 256 / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * s));
    const h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    return maskFromImageData(ctx.getImageData(0, 0, w, h));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Thumb({ choice, mask }: { choice: ShapeChoice; mask: Mask | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, THUMB, THUMB);
    ctx.fillStyle = getComputedStyle(c).color;
    if (choice === 'organic') {
      // a loose scatter of small rectangles
      for (const [x, y, w, h] of [[3, 5, 9, 7], [15, 3, 7, 9], [24, 9, 6, 7], [6, 17, 7, 9], [16, 17, 9, 7], [10, 26, 7, 5], [24, 22, 6, 8]])
        ctx.fillRect(x, y, w, h);
      return;
    }
    if (!mask) {
      // Custom with no image yet: a plus sign
      ctx.fillRect(15, 6, 2, 20);
      ctx.fillRect(6, 15, 20, 2);
      return;
    }
    const m = document.createElement('canvas');
    m.width = mask.width;
    m.height = mask.height;
    m.getContext('2d')!.putImageData(new ImageData(maskToRGBA(mask, [0, 0, 0, 255]) as Uint8ClampedArray<ArrayBuffer>, mask.width, mask.height), 0, 0);
    const s = (THUMB - 2) / Math.max(mask.width, mask.height);
    const w = mask.width * s, h = mask.height * s;
    ctx.globalCompositeOperation = 'source-over';
    const tmp = document.createElement('canvas');
    tmp.width = THUMB;
    tmp.height = THUMB;
    const t = tmp.getContext('2d')!;
    t.imageSmoothingQuality = 'high';
    t.drawImage(m, (THUMB - w) / 2, (THUMB - h) / 2, w, h);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = ctx.fillStyle;
    t.fillRect(0, 0, THUMB, THUMB);
    ctx.drawImage(tmp, 0, 0);
  }, [choice, mask]);
  return <canvas ref={ref} className="shape-thumb" width={THUMB} height={THUMB} aria-hidden="true" />;
}

interface Props {
  shape: ShapeChoice;
  invert: boolean;
  /** The current custom mask (with Invert applied), used for its thumbnail. */
  customMask: Mask | null;
  onShape: (s: ShapeChoice) => void;
  onCustomFile: (f: File) => void;
  onInvert: (v: boolean) => void;
  error: string | null;
}

export function ShapePicker({ shape, invert, customMask, onShape, onCustomFile, onInvert, error }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);

  const pick = (o: ShapeChoice) => {
    if (o === 'custom') fileRef.current?.click();
    else onShape(o);
  };
  // Arrow keys move focus along the group; Enter/Space chooses (so Custom never opens the file picker by accident).
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    btns.current[(i + d + OPTIONS.length) % OPTIONS.length]?.focus();
  };

  return (
    <div className="shape-picker">
      <span className="shape-label" id="shape-label">Shape</span>
      <div role="radiogroup" aria-labelledby="shape-label" className="shape-group">
        {OPTIONS.map((o, i) => (
          <button
            key={o}
            ref={(el) => { btns.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={shape === o}
            tabIndex={shape === o ? 0 : -1}
            className={shape === o ? 'shape-opt on' : 'shape-opt'}
            onClick={() => pick(o)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <Thumb choice={o} mask={o === 'custom' ? customMask : o === 'organic' ? null : shapeMask(o as ShapeId)} />
            <span>{o === 'custom' ? 'Custom image…' : SHAPE_NAMES[o]}</span>
          </button>
        ))}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCustomFile(f);
          e.target.value = '';
        }}
      />
      {shape === 'custom' && (
        <label className="shape-invert">
          <input type="checkbox" checked={invert} onChange={(e) => onInvert(e.target.checked)} /> Invert
        </label>
      )}
      {error && <span className="errors shape-error" role="alert">{error}</span>}
    </div>
  );
}
