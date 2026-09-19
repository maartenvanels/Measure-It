'use client';

import { useEffect, useCallback, useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import type { Event as ThreeEvent } from 'three';
import { beginDocumentEdit, endDocumentEdit } from '@/lib/document-history';
import { useUIStore } from '@/stores/useUIStore';

/**
 * Renders a TransformControls gizmo on the currently selected scene object.
 * Reads the target from the object ref registry in useSceneObjectStore.
 * Updates object transform on change. Skips locked objects.
 */
export function TransformGizmo() {
  const drawingMode = useUIStore((s) => s.mode);
  const selectedObjectId = useSceneObjectStore((s) => s.selectedObjectId);
  const transformMode = useSceneObjectStore((s) => s.transformMode);
  const objectRefs = useSceneObjectStore((s) => s.objectRefs);
  const objects = useSceneObjectStore((s) => s.objects);
  const setTransform = useSceneObjectStore((s) => s.setTransform);
  const pushHistory = useSceneObjectStore((s) => s.pushHistory);
  const draggingRef = useRef(false);

  const selectedObject = objects.find((o) => o.id === selectedObjectId);
  const isLocked = selectedObject?.locked ?? false;
  const isVisible = selectedObject?.visible ?? false;
  const targetRef = selectedObjectId ? objectRefs.get(selectedObjectId) : undefined;
  const target = targetRef?.current ?? undefined;

  // Sync transform back to store when gizmo changes
  const handleObjectChange = useCallback(
    (_e?: ThreeEvent) => {
      if (!selectedObjectId || !target) return;
      setTransform(selectedObjectId, {
        position: [target.position.x, target.position.y, target.position.z],
        rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
        scale: [target.scale.x, target.scale.y, target.scale.z],
      });
    },
    [selectedObjectId, target, setTransform],
  );

  // Snapshot state once at the start of each drag for one undoable step per interaction.
  const handleMouseDown = useCallback(() => {
    if (draggingRef.current) return;
    draggingRef.current = true;
    beginDocumentEdit();
    pushHistory();
  }, [pushHistory]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
    endDocumentEdit();
  }, []);

  // Keyboard shortcuts for transform modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || useUIStore.getState().mode !== 'none') return;
      // Don't trigger in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const setMode = useSceneObjectStore.getState().setTransformMode;
      if (e.key === 't' || e.key === 'T') setMode('translate');
      else if (e.key === 'r' || e.key === 'R') setMode('rotate');
      else if (e.key === 's' || e.key === 'S') setMode('scale');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Don't render if no object selected, object is locked, or no ref available
  if (drawingMode !== 'none' || !selectedObjectId || !target || isLocked || !isVisible) return null;

  return (
    <TransformControls
      object={target}
      mode={transformMode}
      onObjectChange={handleObjectChange}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      space="local"
    />
  );
}
