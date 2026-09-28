import { photos } from '../data';

// Stub: proves the data import works. Replaced by the canvas agent.
export function App() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.24em' }}>VISUAL THREADS</div>
      <div style={{ fontSize: 12, marginTop: 8, color: 'var(--ink-muted)' }}>
        {photos.length} photos
      </div>
    </div>
  );
}
