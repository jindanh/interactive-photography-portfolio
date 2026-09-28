import { useCallback, useEffect, useRef } from 'react';
import { VisualCanvas } from './components/VisualCanvas';
import { Intro } from './components/Intro';
import type { CameraApi } from './hooks/useCamera';
import './styles/canvas.css';
import './styles/intro.css';

const INTRO_SCALE = 0.88;

export function App() {
  const camera = useRef<CameraApi>(null);

  // Start slightly zoomed out; the intro dismissal eases to the fit view.
  useEffect(() => {
    const c = camera.current;
    if (!c) return;
    const { scale } = c.getCamera();
    c.setCamera({ scale: scale * INTRO_SCALE });
  }, []);

  const onDismiss = useCallback(() => {
    void camera.current?.fitTo(undefined, { animate: true, duration: 1400 });
  }, []);

  return (
    <>
      <VisualCanvas ref={camera} />
      <Intro onDismiss={onDismiss} />
    </>
  );
}
