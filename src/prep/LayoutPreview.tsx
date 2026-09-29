import { useMemo } from 'react';
import { NODE_SIZE, type Connection, type Photo } from '../types';
import type { MaskFrame } from '../analysis/shapedLayout';
import { maskToRGBA, type Mask } from '../analysis/shapes';

export interface Underlay {
  mask: Mask;
  frame: MaskFrame;
}

function maskDataUrl(mask: Mask): string {
  const c = document.createElement('canvas');
  c.width = mask.width;
  c.height = mask.height;
  c.getContext('2d')!.putImageData(new ImageData(maskToRGBA(mask, [0, 0, 0, 255]) as Uint8ClampedArray<ArrayBuffer>, mask.width, mask.height), 0, 0);
  return c.toDataURL('image/png');
}

interface Props {
  photos: Photo[];
  connections: Connection[];
  selected: string | null;
  neighbors: Map<string, number>;
  onSelect: (id: string | null) => void;
  underlay?: Underlay | null;
}

export function LayoutPreview({ photos, connections, selected, neighbors, onSelect, underlay }: Props) {
  const url = useMemo(() => (underlay ? maskDataUrl(underlay.mask) : null), [underlay?.mask]);
  const box = (p: Photo) => {
    const w = p.aspect >= 1 ? NODE_SIZE : NODE_SIZE * p.aspect;
    const h = p.aspect >= 1 ? NODE_SIZE / p.aspect : NODE_SIZE;
    return { w, h };
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of photos) {
    const { w, h } = box(p);
    x0 = Math.min(x0, p.x - w / 2); x1 = Math.max(x1, p.x + w / 2);
    y0 = Math.min(y0, p.y - h / 2); y1 = Math.max(y1, p.y + h / 2);
  }
  let ux = 0, uy = 0, uw = 0, uh = 0;
  if (underlay) {
    const { mask, frame } = underlay;
    ux = frame.x0; uy = frame.y0; uw = mask.width * frame.scale; uh = mask.height * frame.scale;
    x0 = Math.min(x0, ux); y0 = Math.min(y0, uy); x1 = Math.max(x1, ux + uw); y1 = Math.max(y1, uy + uh);
  }
  const pad = NODE_SIZE * 0.3;
  const byId = new Map(photos.map((p) => [p.id, p]));
  return (
    <div className="preview">
      <div className="label">Layout preview</div>
      <svg
        viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`}
        onClick={() => onSelect(null)}
        role="img"
        aria-label="Map of the photo layout"
      >
        {url && (
          <image className="underlay" href={url} x={ux} y={uy} width={uw} height={uh} opacity={0.06} preserveAspectRatio="none" />
        )}
        {connections.map((c) => {
          const a = byId.get(c.source)!, b = byId.get(c.target)!;
          const hot = selected && (c.source === selected || c.target === selected);
          return (
            <line
              key={c.source + c.target}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="currentColor"
              strokeWidth={hot ? 5 : 2}
              opacity={hot ? 0.7 : selected ? 0.05 : 0.18}
            />
          );
        })}
        {photos.map((p) => {
          const { w, h } = box(p);
          const dim = selected && p.id !== selected && !neighbors.has(p.id);
          return (
            <rect
              key={p.id}
              x={p.x - w / 2} y={p.y - h / 2} width={w} height={h}
              fill={p.colors[0].hex}
              opacity={dim ? 0.25 : 1}
              stroke={p.id === selected ? 'currentColor' : 'none'}
              strokeWidth={6}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(p.id === selected ? null : p.id);
              }}
            >
              <title>{p.id}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
