import { NODE_SIZE, type Connection, type Photo } from '../types';

interface Props {
  photos: Photo[];
  connections: Connection[];
  selected: string | null;
  neighbors: Map<string, number>;
  onSelect: (id: string | null) => void;
}

export function LayoutPreview({ photos, connections, selected, neighbors, onSelect }: Props) {
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
