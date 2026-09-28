import { zipSync } from 'fflate';
import type { Connection, Photo } from '../types';

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Contract-shaped, rounded copies: x/y integers, numbers 3 decimals, strength 2 decimals. */
export function serializePhotos(photos: Photo[]): string {
  const rows = photos.map((p) => ({
    id: p.id,
    src: { sm: p.src.sm, lg: p.src.lg },
    width: p.width,
    height: p.height,
    aspect: r3(p.aspect),
    colors: p.colors.map((c) => ({ hex: c.hex.toLowerCase(), weight: r3(c.weight) })),
    brightness: r3(p.brightness),
    saturation: r3(p.saturation),
    x: Math.round(p.x),
    y: Math.round(p.y),
  }));
  return JSON.stringify(rows, null, 2) + '\n';
}

export function serializeConnections(connections: Connection[]): string {
  const rows = connections.map((c) => ({
    source: c.source,
    target: c.target,
    type: c.type,
    strength: Math.round(c.strength * 100) / 100,
  }));
  return JSON.stringify(rows, null, 2) + '\n';
}

export interface NewImages {
  id: string;
  sm: Blob;
  lg: Blob;
}

/** Zip with repo-relative paths; unzip at the repo root. */
export async function buildZip(photos: Photo[], connections: Connection[], images: NewImages[]): Promise<Blob> {
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  for (const img of images) {
    files[`public/photos/${img.id}-sm.webp`] = [new Uint8Array(await img.sm.arrayBuffer()), { level: 0 }];
    files[`public/photos/${img.id}-lg.webp`] = [new Uint8Array(await img.lg.arrayBuffer()), { level: 0 }];
  }
  files['src/data/photos.json'] = enc.encode(serializePhotos(photos));
  files['src/data/connections.json'] = enc.encode(serializeConnections(connections));
  const zipped = zipSync(files);
  return new Blob([zipped], { type: 'application/zip' });
}
