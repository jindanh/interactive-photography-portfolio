import { memo } from 'react';
import { photoById } from '../../data';
import { TRAIL_MAX } from '../state/threadState';
import { curvePath } from './Connection';

/** Faint persistent path through the visited sequence (previous foci + current focus). */
export const Trail = memo(function Trail({ trail, focusedId }: { trail: string[]; focusedId: string | null }) {
  const seq = focusedId ? [...trail, focusedId] : trail;
  const ids = seq.slice(-TRAIL_MAX);
  const segs: { key: string; d: string }[] = [];
  for (let i = 1; i < ids.length; i++) {
    const a = photoById.get(ids[i - 1]);
    const b = photoById.get(ids[i]);
    if (!a || !b || a === b) continue;
    segs.push({ key: `${a.id}>${b.id}`, d: curvePath(a, b) });
  }
  return (
    <g className="trail">
      {segs.map((s) => (
        <path key={s.key} d={s.d} fill="none" />
      ))}
    </g>
  );
});
