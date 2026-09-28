import { memo, useState } from 'react';
import type { Photo } from '../../types';
import type { NodeState } from '../state/threadState';
import { nodeSize } from '../utils/geometry';
import '../styles/abstraction.css';

export type { NodeState };

export interface PhotoNodeProps {
  photo: Photo;
  state: NodeState;
  /** In the Tab order (computed from focus only, not hover). */
  tabbable: boolean;
  /** This is the focused photo (aria-current), regardless of hover. */
  current: boolean;
  /** `keyboard` = focus-visible focus; it bypasses the app's hover lock. */
  onPointerEnter: (id: string, source?: 'keyboard') => void;
  onPointerLeave: (id: string, source?: 'keyboard') => void;
  onClick: (id: string, pointerType?: string) => void;
}

const BASE = import.meta.env.BASE_URL;

function PhotoNodeImpl({ photo, state, tabbable, current, onPointerEnter, onPointerLeave, onClick }: PhotoNodeProps) {
  const [loaded, setLoaded] = useState(false);
  const [lgWanted, setLgWanted] = useState(false);
  const [lgLoaded, setLgLoaded] = useState(false);
  if (state === 'focused' && !lgWanted) setLgWanted(true); // stays mounted after unfocus
  const { w, h } = nodeSize(photo);
  return (
    <div
      className={`photo-node is-${state}`}
      data-id={photo.id}
      role="button"
      tabIndex={tabbable ? 0 : -1}
      aria-label={photo.alt ?? `Photograph ${parseInt(photo.id, 10)}`}
      aria-current={current ? 'true' : undefined}
      style={{
        width: w,
        height: h,
        transform: `translate(${photo.x - w / 2}px, ${photo.y - h / 2}px)`,
        backgroundColor: photo.colors[0]?.hex,
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onPointerEnter(photo.id)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onPointerLeave(photo.id)}
      onFocus={(e) =>
        e.target === e.currentTarget && e.currentTarget.matches(':focus-visible') && onPointerEnter(photo.id, 'keyboard')
      }
      onBlur={(e) => e.target === e.currentTarget && onPointerLeave(photo.id, 'keyboard')}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onClick(photo.id, 'keyboard');
      }}
      onClick={() => onClick(photo.id)}
    >
      <div className="face-photo">
        <img
          className={loaded ? 'is-loaded' : undefined}
          src={BASE + photo.src.sm}
          loading="lazy"
          decoding="async"
          draggable={false}
          alt=""
          onLoad={() => setLoaded(true)}
        />
        {lgWanted && (
          <img
            className={`face-lg${lgLoaded ? ' is-loaded' : ''}`}
            src={BASE + photo.src.lg}
            decoding="async"
            draggable={false}
            alt=""
            onLoad={() => setLgLoaded(true)}
          />
        )}
      </div>
      <div className={`face-card ${photo.aspect < 1 ? 'is-portrait' : 'is-landscape'}`} aria-hidden="true">
        {photo.colors.map((c, i) => (
          <i key={i} style={{ flexGrow: c.weight, backgroundColor: c.hex }} />
        ))}
      </div>
    </div>
  );
}

export const PhotoNode = memo(PhotoNodeImpl);
