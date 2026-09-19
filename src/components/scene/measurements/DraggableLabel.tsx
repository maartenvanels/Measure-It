'use client';

import { useRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import { Point } from '@/types/measurement';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { beginDocumentEdit, endDocumentEdit } from '@/lib/document-history';

interface DraggableLabelProps {
  measurementId: string;
  position: [number, number, number];
  offset?: Point;
  labelType: 'value' | 'name';
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Draggable HTML label positioned in 3D space.
 * Reused for both 2D image measurements and 3D model measurements.
 */
export function DraggableLabel({ measurementId, position, offset, labelType, children, style }: DraggableLabelProps) {
  const dragRef = useRef<{ startX: number; startY: number; origOffset: Point } | null>(null);
  const updateMeasurement = useMeasurementStore((s) => s.updateMeasurement);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    beginDocumentEdit();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origOffset: offset ?? { x: 0, y: 0 },
    };
  }, [offset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newOffset = { x: dragRef.current.origOffset.x + dx, y: dragRef.current.origOffset.y + dy };
    const field = labelType === 'value' ? 'labelOffset' : 'nameLabelOffset';
    updateMeasurement(measurementId, { [field]: newOffset });
  }, [measurementId, labelType, updateMeasurement]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    endDocumentEdit();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;

  return (
    <Html position={position} center style={{ pointerEvents: 'auto' }}>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: `translate(${ox}px, ${oy}px)`,
          cursor: 'grab',
          userSelect: 'none',
          ...style,
        }}
      >
        {children}
      </div>
    </Html>
  );
}
