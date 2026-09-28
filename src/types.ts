/**
 * World units of a node's LONG edge at scale 1.
 * Short edge = NODE_SIZE / max(aspect, 1 / aspect).
 */
export const NODE_SIZE = 240;

/** One dominant color of a photo. */
export interface PaletteColor {
  hex: string;     // "#rrggbb"
  weight: number;  // share of the image; normalized to sum to 1
}

export interface Photo {
  /**
   * "NNN-slug" (zero-padded ordinal + filename slug). Unique and immutable
   * once exported; new photos get max(NNN) + 1. Asset filenames are
   * "{id}-sm.webp" / "{id}-lg.webp".
   */
  id: string;
  /**
   * Paths relative to the site base, NO leading slash,
   * e.g. "photos/001-dusk-sm.webp". Resolve with import.meta.env.BASE_URL + path.
   */
  src: { sm: string; lg: string };
  /** Pixel size of the lg image (lg long edge ≈ 1800px; sm long edge ≈ 480px). */
  width: number;
  height: number;
  /** width / height */
  aspect: number;
  /** 3–5 colors, sorted by weight descending. */
  colors: PaletteColor[];
  brightness: number;  // 0..1
  saturation: number;  // 0..1
  /**
   * World-space CENTER of the node, in world units (see NODE_SIZE).
   * +y is down. Layout is roughly centered on (0, 0).
   */
  x: number;
  y: number;
}

export type ConnectionType = 'color';

/**
 * Undirected; each pair appears exactly once with source < target (string
 * compare); no self-loops. Degree per photo 2..5 inclusive.
 * strength: 1 = most similar, absolute (not rank-based), 2 decimals.
 */
export interface Connection {
  source: string;  // Photo.id
  target: string;  // Photo.id
  type: ConnectionType;
  strength: number;  // 0..1
}

/** (x, y) = world point shown at the viewport center; scale = screen px per world unit. */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}
