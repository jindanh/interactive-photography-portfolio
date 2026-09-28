import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { photos } from '../../data';
import { useCamera } from '../hooks/useCamera';
import type { CameraApi } from '../hooks/useCamera';
import { photoBounds } from '../utils/geometry';
import { PhotoNode } from './PhotoNode';
import type { NodeState } from './PhotoNode';

export interface VisualCanvasProps {
  /** Optional per-node state overrides (driven by Wave 2). Hover is layered on top. */
  nodeStates?: Readonly<Record<string, NodeState>>;
  onNodeClick?: (id: string) => void;
}

export const VisualCanvas = forwardRef<CameraApi, VisualCanvasProps>(function VisualCanvas(
  { nodeStates, onNodeClick },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const bounds = useMemo(() => photoBounds(photos), []);
  const camera = useCamera(rootRef, worldRef, bounds);
  useImperativeHandle(ref, () => camera, [camera]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const onEnter = useCallback((id: string) => setHoveredId(id), []);
  const onLeave = useCallback((id: string) => setHoveredId((h) => (h === id ? null : h)), []);
  const onClickRef = useRef(onNodeClick);
  onClickRef.current = onNodeClick;
  const onClick = useCallback((id: string) => onClickRef.current?.(id), []);

  return (
    <div className="visual-canvas" ref={rootRef}>
      <div className="world" ref={worldRef}>
        <svg className="connections" aria-hidden="true" />
        {photos.map((p) => (
          <PhotoNode
            key={p.id}
            photo={p}
            state={p.id === hoveredId ? 'hover' : (nodeStates?.[p.id] ?? 'default')}
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
            onClick={onClick}
          />
        ))}
      </div>
    </div>
  );
});
