import { memo, useMemo } from 'react';
import { photoById } from '../../data';
import type { Photo } from '../../types';
import { nodeSize } from '../utils/geometry';
import type { ActiveEdge, EdgeRef } from '../state/threadState';

const CURVE = 0.15;
const GAP = 4;

/** Point where the ray from center `p` toward `q` leaves p's box (plus a small gap). */
function boxExit(p: Photo, q: Photo): { x: number; y: number } {
  const { w, h } = nodeSize(p);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity);
  const d = Math.min(len * 0.45, t * len + GAP);
  return { x: p.x + (dx / len) * d, y: p.y + (dy / len) * d };
}

/** Gentle quadratic curve, control point offset to a consistent side of the travel direction. */
export function curvePath(a: Photo, b: Photo): string {
  const s = boxExit(a, b);
  const e = boxExit(b, a);
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const cx = (s.x + e.x) / 2 - dy * CURVE;
  const cy = (s.y + e.y) / 2 + dx * CURVE;
  return `M${s.x.toFixed(1)} ${s.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
}

export interface EdgesProps {
  edges: ActiveEdge[];
  onEdgeHover: (edge: EdgeRef | null) => void;
  onEdgeClick: (to: string) => void;
}

function EdgeShape({ edge, onEdgeHover, onEdgeClick }: { edge: ActiveEdge } & Omit<EdgesProps, 'edges'>) {
  const a = photoById.get(edge.from)!;
  const b = photoById.get(edge.to)!;
  // Same geometry regardless of which end the edge is drawn from.
  const [p, q] = edge.from < edge.to ? [a, b] : [b, a];
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
