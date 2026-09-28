import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { photos } from '../../data';
import { useCamera } from '../hooks/useCamera';
import type { CameraApi } from '../hooks/useCamera';
import { photoBounds } from '../utils/geometry';
import { PhotoNode } from './PhotoNode';
import type { NodeState } from './PhotoNode';

export interface VisualCanvasProps {
  /** Per-node state, computed by the owner (memoized). */
  nodeStates?: Readonly<Record<string, NodeState>>;
  onNodeClick?: (id: string, pointerType: string) => void;
  onNodeHover?: (id: string | null) => void;
  /** SVG content in world coordinates (edges, trail), drawn below the nodes. */
  connections?: ReactNode;
}

export const VisualCanvas = forwardRef<CameraApi, VisualCanvasProps>(function VisualCanvas(
  { nodeStates, onNodeClick, onNodeHover, connections },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const bounds = useMemo(() => photoBounds(photos), []);
  const camera = useCamera(rootRef, worldRef, bounds);
  useImperativeHandle(ref, () => camera, [camera]);

  // PhotoNode's onClick has no pointer type; remember the last one.
  const lastPointer = useRef('mouse');
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onDown = (e: PointerEvent) => {
      lastPointer.current = e.pointerType;
    };
    root.addEventListener('pointerdown', onDown, true);
    return () => root.removeEventListener('pointerdown', onDown, true);
  }, []);

  const hoverRef = useRef(onNodeHover);
  hoverRef.current = onNodeHover;
  const onEnter = useCallback((id: string) => hoverRef.current?.(id), []);
  const onLeave = useCallback(() => hoverRef.current?.(null), []);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;
  const onClick = useCallback((id: string) => clickRef.current?.(id, lastPointer.current), []);

  return (
    <div className="visual-canvas" ref={rootRef}>
      <div className="world" ref={worldRef}>
        <svg className="connections" aria-hidden="true">
          {connections}
        </svg>
        {photos.map((p) => (
          <PhotoNode
            key={p.id}
            photo={p}
            state={nodeStates?.[p.id] ?? 'default'}
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
            onClick={onClick}
          />
        ))}
      </div>
    </div>
  );
});
