import type { Connection, Photo } from '../types';
import photosJson from './photos.json';
import connectionsJson from './connections.json';

export const photos = photosJson as Photo[];
export const connections = connectionsJson as Connection[];
export const photoById = new Map<string, Photo>(photos.map((p) => [p.id, p]));

export interface Neighbor {
  photo: Photo;
  connection: Connection;
}

// Adjacency built once, each list sorted by strength desc.
const adjacency = new Map<string, Neighbor[]>();
for (const connection of connections) {
  const a = photoById.get(connection.source);
  const b = photoById.get(connection.target);
  if (!a || !b) continue;
  (adjacency.get(a.id) ?? adjacency.set(a.id, []).get(a.id)!).push({ photo: b, connection });
  (adjacency.get(b.id) ?? adjacency.set(b.id, []).get(b.id)!).push({ photo: a, connection });
}
for (const list of adjacency.values()) {
  list.sort((x, y) => y.connection.strength - x.connection.strength);
}

const none: Neighbor[] = [];

/** Photos connected to `id`, strongest first. */
export function neighbors(id: string): Neighbor[] {
  return adjacency.get(id) ?? none;
}
