import { neighbors } from '../../data';
import type { NodeState } from '../components/PhotoNode';

export const TRAIL_MAX = 12;

export interface EdgeRef {
  /** Photo the edge is drawn from (focused/hovered/previewed). */
  from: string;
  /** Far end: the connected neighbor. */
  to: string;
}

export interface ThreadState {
  focusedId: string | null;
  hoveredId: string | null;
  hoveredEdge: EdgeRef | null;
  /** Touch: first tap previews (acts like hover). */
  previewId: string | null;
  /** Previously focused photos, oldest first (current focus not included). */
  trail: string[];
}

export type ThreadAction =
  | { type: 'hoverNode'; id: string | null }
  | { type: 'hoverEdge'; edge: EdgeRef | null }
  | { type: 'preview'; id: string | null }
  | { type: 'focus'; id: string }
  | { type: 'clear' };

export const initialThreadState: ThreadState = {
  focusedId: null,
  hoveredId: null,
  hoveredEdge: null,
  previewId: null,
  trail: [],
};

export function threadReducer(s: ThreadState, a: ThreadAction): ThreadState {
  switch (a.type) {
    case 'hoverNode':
      return s.hoveredId === a.id ? s : { ...s, hoveredId: a.id };
    case 'hoverEdge': {
      const e = s.hoveredEdge;
      if (e === a.edge || (e && a.edge && e.from === a.edge.from && e.to === a.edge.to)) return s;
      return { ...s, hoveredEdge: a.edge };
    }
    case 'preview':
      return s.previewId === a.id ? s : { ...s, previewId: a.id };
    case 'focus': {
      if (s.focusedId === a.id) return { ...s, previewId: null, hoveredEdge: null };
      let trail = s.trail;
      if (s.focusedId && trail[trail.length - 1] !== s.focusedId) {
        trail = [...trail, s.focusedId].slice(-TRAIL_MAX);
      }
      return { ...s, focusedId: a.id, previewId: null, hoveredEdge: null, trail };
    }
    case 'clear': {
      // Keep the trail intact: fold the current focus into it.
      let trail = s.trail;
      if (s.focusedId && trail[trail.length - 1] !== s.focusedId) {
        trail = [...trail, s.focusedId].slice(-TRAIL_MAX);
      }
      return { ...s, focusedId: null, previewId: null, hoveredEdge: null, trail };
    }
  }
}

/** Precedence: hover > focused > connected > dim > default. */
export function computeNodeStates(s: ThreadState, allIds: readonly string[]): Record<string, NodeState> {
  const out: Record<string, NodeState> = {};
  const connected = new Set<string>();
  for (const id of [s.focusedId, s.hoveredId, s.previewId]) {
    if (id) for (const n of neighbors(id)) connected.add(n.photo.id);
  }
  if (s.hoveredEdge) connected.add(s.hoveredEdge.to);
  const dimming = s.focusedId !== null;
  for (const id of allIds) {
    if (id === s.hoveredId || id === s.previewId) out[id] = 'hover';
    else if (id === s.focusedId) out[id] = 'focused';
    else if (connected.has(id)) out[id] = 'connected';
    else out[id] = dimming ? 'dim' : 'default';
  }
  return out;
}

export interface ActiveEdge {
  key: string;
  from: string;
  to: string;
  /** Emphasized (hover/preview/hovered edge) rather than resting (focused). */
  active: boolean;
  hovered: boolean;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Edges to draw: those of focused, hovered and previewed nodes only. */
export function computeEdges(s: ThreadState): ActiveEdge[] {
  const seen = new Map<string, ActiveEdge>();
  const add = (from: string | null, active: boolean) => {
    if (!from) return;
    for (const n of neighbors(from)) {
      const to = n.photo.id;
      const key = pairKey(from, to);
      const prev = seen.get(key);
      if (prev) {
        if (active) prev.active = true;
        continue;
      }
      seen.set(key, { key, from, to, active, hovered: false });
    }
  };
  add(s.focusedId, false);
  add(s.hoveredId, true);
  add(s.previewId, true);
  const e = s.hoveredEdge;
  if (e) {
    const cur = seen.get(pairKey(e.from, e.to));
    if (cur) {
      cur.active = true;
      cur.hovered = true;
    }
  }
  return [...seen.values()];
}
