import { useEffect, useRef, useState } from 'react';

const AUTO_MS = 3500;
const FADE_MS = 800;

/** Quiet wordmark over the (already rendered) photo space. Not a modal, no button. */
export function Intro({ onDismiss }: { onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const cb = useRef(onDismiss);
  cb.current = onDismiss;
  const done = useRef(false);

  useEffect(() => {
    const dismiss = () => {
      if (done.current) return;
      done.current = true;
      setLeaving(true);
      cb.current();
      window.setTimeout(() => setGone(true), FADE_MS + 50);
    };
    const timer = window.setTimeout(dismiss, AUTO_MS);
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, dismiss, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, dismiss));
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`intro${leaving ? ' is-leaving' : ''}`} aria-hidden={leaving}>
      <h1 className="intro-mark">VISUAL THREADS</h1>
      <p className="intro-line">Follow where one image leads.</p>
    </div>
  );
}
