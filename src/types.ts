/** One dominant color of a photo. */
export interface PaletteColor {
  hex: string;     // "#rrggbb"
  weight: number;  // share of the image; weights sum to ~1
}

export interface Photo {
  id: string;
  /** Public URLs, e.g. "/photos/001-dusk-sm.webp". */
  src: { sm: string; lg: string };
  /** Pixel size of the lg image. */
  width: number;
  height: number;
  /** width / height */
  aspect: number;
  /** 3–5 colors, sorted by weight descending. */
  colors: PaletteColor[];
  brightness: number;  // 0..1
  saturation: number;  // 0..1
  /** Precomputed world-space layout position. */
  x: number;
  y: number;
}

export type ConnectionType = 'color';

/** Undirected edge; each pair appears once. */
export interface Connection {
  source: string;  // Photo.id
  target: string;  // Photo.id
  type: ConnectionType;
  strength: number;  // 0..1
}

export interface Camera {
  x: number;
  y: number;
  scale: number;
}
