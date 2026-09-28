import { memo, useState } from 'react';
import type { Photo } from '../../types';
import { nodeSize } from '../utils/geometry';
import '../styles/abstraction.css';

export type NodeState = 'default' | 'hover' | 'focused' | 'connected' | 'dim';

export interface PhotoNodeProps {
  photo: Photo;
  state: NodeState;
  onPointerEnter: (id: string) => void;
  onPointerLeave: (id: string) => void;
  onClick: (id: string) => void;
}

const BASE = import.meta.env.BASE_URL;

function PhotoNodeImpl({ photo, state, onPointerEnter, onPointerLeave, onClick }: PhotoNodeProps) {
  const [loaded, setLoaded] = useState(false);
  const { w, h } = nodeSize(photo);
  return (
    <div
      className={`photo-node is-${state}`}
      data-id={photo.id}
      data-lg={BASE + photo.src.lg}
      style={{
        width: w,
        height: h,
        transform: `translate(${photo.x - w / 2}px, ${photo.y - h / 2}px)`,
        backgroundColor: photo.colors[0]?.hex,
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onPointerEnter(photo.id)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onPointerLeave(photo.id)}
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
