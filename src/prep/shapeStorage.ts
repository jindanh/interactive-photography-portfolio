import { decodeMask, encodeMask, type Mask, type ShapeId } from '../analysis/shapes';

export const SHAPE_KEY = 'visual-threads:prep-shape:v1';

export type ShapeChoice = 'organic' | ShapeId | 'custom';

export interface SavedShape {
  shape: ShapeChoice;
  invert: boolean;
  /** The picked image as an un-inverted mask (Invert stays adjustable after a reload). Only for 'custom'. */
  custom: Mask | null;
}

const IDS: readonly string[] = ['organic', 'flower', 'umbrella', 'heart', 'circle', 'custom'];
export const ORGANIC: SavedShape = { shape: 'organic', invert: false, custom: null };

/** Reads the remembered choice. Anything missing or corrupt silently falls back to Organic. */
export function loadShape(): SavedShape {
  try {
    const raw = localStorage.getItem(SHAPE_KEY);
    if (!raw) return ORGANIC;
    const v = JSON.parse(raw);
    if (!v || v.v !== 1 || typeof v.shape !== 'string' || !IDS.includes(v.shape)) return ORGANIC;
    if (v.shape === 'custom') {
      const mask = typeof v.mask === 'string' ? decodeMask(v.mask) : null;
      if (!mask) return ORGANIC;
      return { shape: 'custom', invert: v.invert === true, custom: mask };
    }
    return { shape: v.shape as ShapeChoice, invert: false, custom: null };
  } catch {
    return ORGANIC;
  }
}

export function saveShape(s: SavedShape): void {
  try {
    const value: Record<string, unknown> = { v: 1, shape: s.shape };
    if (s.shape === 'custom' && s.custom) {
      value.invert = s.invert;
      value.mask = encodeMask(s.custom);
    }
    localStorage.setItem(SHAPE_KEY, JSON.stringify(value));
  } catch {
    // storage unavailable or full: the choice just isn't remembered
  }
}

export const K_KEY = 'visual-threads:prep-k:v1';
export const OUTLINE_KEY = 'visual-threads:prep-outline:v1';
export const DEFAULT_K = 3;

/** The remembered connections-per-photo, or null when nothing valid is saved (an integer 2-5 is valid). */
export function loadK(): number | null {
  try {
    const raw = localStorage.getItem(K_KEY);
    if (raw === null || !/^[2-5]$/.test(raw)) return null;
    return Number(raw);
  } catch {
    return null;
  }
}

export function saveK(k: number): void {
  try {
    localStorage.setItem(K_KEY, String(k));
  } catch {
    // not remembered
  }
}

/** Whether the shape outline underlay is shown in the preview (default on). */
export function loadOutline(): boolean {
  try {
    return localStorage.getItem(OUTLINE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveOutline(on: boolean): void {
  try {
    localStorage.setItem(OUTLINE_KEY, on ? '1' : '0');
  } catch {
    // not remembered
  }
}
