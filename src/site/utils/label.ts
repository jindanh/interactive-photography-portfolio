import type { Photo } from '../../types';

/** Accessible name of a photo: its alt text, else "Photograph N". */
export function photoLabel(p: Pick<Photo, 'id' | 'alt'>): string {
  return p.alt ?? `Photograph ${parseInt(p.id, 10)}`;
}
