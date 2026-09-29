import { forwardRef, useCallback, useEffect, useLayoutEffect, useImperativeHandle, useMemo, useRef } from 'react';
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
  /** Which nodes are in the Tab order (independent of visual state). */
  tabbable?: Readonly<Record<string, boolean>>;
  /** The focused photo id (drives aria-current). */
  focusedId?: string | null;
  onNodeClick?: (id: string, pointerType: string) => void;
  onNodeHover?: (id: string | null, source?: 'keyboard') => void;
  /** Click/tap on empty canvas (not a node, edge, or the end of a drag). */
  onBackgroundClick?: () => void;
  /** SVG content in world coordinates (edges, trail), drawn above dim nodes, below connected/focused ones (see the z-order rules in canvas.css). */
  connections?: ReactNode;
  /** Makes the whole canvas inert (set via the DOM property; React 18 types lack it). */
  inert?: boolean;
  /** Photo hidden because the detail view shows it. */
  concealedId?: string | null;
}

export const VisualCanvas = forwardRef<CameraApi, VisualCanvasProps>(function VisualCanvas(
  { nodeStates, tabbable, focusedId, onNodeClick, onNodeHover, onBackgroundClick, connections, inert, concealedId },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const bounds = useMemo(() => photoBounds(photos), []);
  useLayoutEffect(() => {
    if (rootRef.current) rootRef.current.inert = !!inert;
  }, [inert]);
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

  const bgRef = useRef(onBackgroundClick);
  bgRef.current = onBackgroundClick;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onBg = (e: MouseEvent) => {
      if (e.defaultPrevented || e.target !== root) return; // drag-suppression preventDefaults
      bgRef.current?.();
    };
    // Keyboard focus can scroll this overflow:hidden container; keep it pinned.
    const onScroll = () => {
      root.scrollTop = 0;
      root.scrollLeft = 0;
    };
    root.addEventListener('click', onBg);
    root.addEventListener('scroll', onScroll);
    return () => {
      root.removeEventListener('click', onBg);
      root.removeEventListener('scroll', onScroll);
    };
  }, []);

  const hoverRef = useRef(onNodeHover);
  hoverRef.current = onNodeHover;
  const onEnter = useCallback((id: string, source?: 'keyboard') => hoverRef.current?.(id, source), []);
  const onLeave = useCallback((_id: string, source?: 'keyboard') => hoverRef.current?.(null, source), []);
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;
  const onClick = useCallback(
    (id: string, pointerType?: string) => clickRef.current?.(id, pointerType ?? lastPointer.current),
    [],
  );

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
            tabbable={tabbable ? tabbable[p.id] === true : true}
            current={focusedId === p.id}
            concealed={concealedId === p.id}
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
            onClick={onClick}
          />
        ))}
      </div>
    </div>
  );
});
