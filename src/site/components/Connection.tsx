import { memo, useMemo } from 'react';
import { photoById } from '../../data';
import { curvePath } from '../utils/geometry';
import type { ActiveEdge, EdgeRef } from '../state/threadState';

export interface EdgesProps {
  edges: ActiveEdge[];
  onEdgeHover: (edge: EdgeRef | null) => void;
  onEdgeClick: (to: string) => void;
}

function EdgeShape({ edge, onEdgeHover, onEdgeClick }: { edge: ActiveEdge } & Omit<EdgesProps, 'edges'>) {
  const a = photoById.get(edge.from)!;
  const b = photoById.get(edge.to)!;
  // curvePath normalizes direction by id, so gradient must follow the same order.
  const [p, q] = a.id < b.id ? [a, b] : [b, a];
  const d = useMemo(() => curvePath(p, q), [p, q]);
  const gid = `eg-${edge.key}`;
  const cls = `edge${edge.active ? ' is-active' : ''}${edge.hovered ? ' is-hovered' : ''}`;
  return (
    <g>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={p.x} y1={p.y} x2={q.x} y2={q.y}>
          <stop offset="0" stopColor={p.colors[0]?.hex} />
          <stop offset="1" stopColor={q.colors[0]?.hex} />
        </linearGradient>
      </defs>
      <path className={cls} d={d} stroke={`url(#${gid})`} fill="none" />
      <path
        className="edge-hit"
        d={d}
        fill="none"
        onPointerEnter={(e) => e.pointerType === 'mouse' && onEdgeHover({ from: edge.from, to: edge.to })}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onEdgeHover(null)}
        onClick={() => onEdgeClick(edge.to)}
      />
    </g>
  );
}

export const Connection = memo(function Connection({ edges, onEdgeHover, onEdgeClick }: EdgesProps) {
  return (
    <g className="edges">
      {edges.map((e) => (
        <EdgeShape key={e.key} edge={e} onEdgeHover={onEdgeHover} onEdgeClick={onEdgeClick} />
      ))}
    </g>
  );
});

// Re-exported for existing importers; implementation lives in utils/geometry.
export { curvePath };
