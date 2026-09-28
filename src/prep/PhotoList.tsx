import type { Photo } from '../types';

interface Props {
  photos: Photo[];
  thumbs: Map<string, string>;
  degrees: Map<string, number>;
  selected: string | null;
  neighbors: Map<string, number>;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export function PhotoList({ photos, thumbs, degrees, selected, neighbors, onSelect, onRemove }: Props) {
  return (
    <ul className="list">
      {photos.map((p) => {
        const strength = neighbors.get(p.id);
        const cls = ['item', p.id === selected ? 'selected' : '', strength !== undefined ? 'neighbor' : ''].join(' ');
        return (
          <li key={p.id} className={cls} onClick={() => onSelect(p.id)}>
            <img
              src={thumbs.get(p.id)}
              alt=""
              style={{ background: p.colors[0].hex }}
              onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
            />
            <div className="meta">
              <div className="id">
                {p.id}
                {strength !== undefined && <span className="strength"> connected, strength {strength.toFixed(2)}</span>}
              </div>
              <div className="bar" title={p.colors.map((c) => `${c.hex} ${Math.round(c.weight * 100)}%`).join('  ')}>
                {p.colors.map((c) => (
                  <span key={c.hex} style={{ background: c.hex, flexGrow: c.weight }} />
                ))}
              </div>
              <div className="nums">
                brightness {p.brightness.toFixed(2)} · saturation {p.saturation.toFixed(2)} · connections {degrees.get(p.id) ?? 0}
              </div>
            </div>
            <button
              className="x"
              aria-label={`Remove ${p.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(p.id);
              }}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
