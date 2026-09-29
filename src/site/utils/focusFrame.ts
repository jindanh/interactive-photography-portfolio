import { neighbors, photoById, photos } from '../../data';
import { NODE_SIZE } from '../../types';
import type { Camera } from '../../types';
import { fitCamera, nodeSize, photoBounds, portraitFactor } from './geometry';

/**
 * Camera for a focused photo: centered on it, zoomed so that it and ALL its
 * neighbors sit within 42% of the viewport (half-extent) around the center.
 * Scale never exceeds cap (focused node at 40% of the short side) and never drops below
 * ~home zoom. The spec's 0.6*cap floor was removed: neighbors up to ~830 units away
 * would not fit above it (40% of photos framed); every neighbor set fits above home zoom.
 */
export function focusFrame(id: string, vw: number, vh: number): Camera | null {
  const f = photoById.get(id);
  if (!f) return null;
  const cap = (0.4 * Math.min(vw, vh)) / NODE_SIZE;
  const fs = nodeSize(f);
  let hw = fs.w / 2;
  let hh = fs.h / 2;
  for (const n of neighbors(id)) {
    const s = nodeSize(n.photo);
    hw = Math.max(hw, Math.abs(n.photo.x - f.x) + s.w / 2);
    hh = Math.max(hh, Math.abs(n.photo.y - f.y) + s.h / 2);
  }
  const fit = Math.min((vw * 0.42) / hw, (vh * 0.42) / hh);
  const bounds = photoBounds(photos);
  const home = fitCamera(bounds, vw, vh).scale * portraitFactor(bounds, vw, vh);
  return { x: f.x, y: f.y, scale: Math.max(Math.min(fit, cap), Math.min(0.9 * home, cap)) };
}
