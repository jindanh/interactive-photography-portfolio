export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export interface TweenHandle {
  /** Resolves when finished OR cancelled. */
  done: Promise<void>;
  cancel: () => void;
}

/** rAF tween. onFrame receives the eased progress 0..1 (raw progress as 2nd arg). */
export function tween(
  duration: number,
  onFrame: (eased: number, raw: number) => void,
  ease: (t: number) => number = easeInOutCubic,
): TweenHandle {
  let raf = 0;
  let cancelled = false;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const start = performance.now();
  const step = (now: number) => {
    if (cancelled) return;
    const raw = Math.min(1, (now - start) / Math.max(1, duration));
    onFrame(ease(raw), raw);
    if (raw < 1) raf = requestAnimationFrame(step);
    else resolve();
  };
  raf = requestAnimationFrame(step);
  return {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(raf);
      resolve();
    },
  };
}
