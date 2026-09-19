'use client';

import { useCallback, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { MapControls, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { zoomCameraAt } from '@/lib/view-navigation';
import { useCanvasStore } from '@/stores/useCanvasStore';

interface SceneControlsProps {
  /** Disable controls (e.g. during drawing) */
  disabled?: boolean;
  /** 'ortho' for 2D image viewing, 'orbit' for 3D model */
  mode: 'ortho' | 'orbit';
}

/**
 * Camera controls that switch between:
 * - MapControls (ortho/2D): left-drag=pan, scroll=zoom, no rotation
 * - OrbitControls (orbit/3D): full orbit, zoom, pan
 */
export function SceneControls({ disabled = false, mode }: SceneControlsProps) {
  const { camera, gl, controls, invalidate } = useThree();
  const syncView = useCallback(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const rect = gl.domElement.getBoundingClientRect();
    const transform = { zoom: camera.zoom, panX: rect.width / 2 - camera.position.x * camera.zoom,
      panY: rect.height / 2 + camera.position.y * camera.zoom };
    const previous = useCanvasStore.getState().transform;
    if (previous.zoom !== transform.zoom || previous.panX !== transform.panX || previous.panY !== transform.panY)
      useCanvasStore.getState().setTransform(transform);
  }, [camera, gl]);
  useEffect(() => {
    const canvas = gl.domElement;
    const navigation = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    const zoom = (factor: number, x = 0, y = 0) => {
      if (!navigation?.target) return;
      zoomCameraAt(camera, navigation.target, new THREE.Vector2(x, y), factor);
      navigation.update();
      syncView();
      invalidate();
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const rect = canvas.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      zoom(Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.002),
        2 * (event.clientX - rect.left) / rect.width - 1,
        1 - 2 * (event.clientY - rect.top) / rect.height);
    };
    const key = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!['+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      zoom(event.key === '-' ? 1 / 1.25 : 1.25);
    };
    const button = (event: Event) => zoom((event as CustomEvent<number>).detail);
    canvas.addEventListener('wheel', wheel, { passive: false, capture: true });
    window.addEventListener('keydown', key);
    window.addEventListener('measureit:zoom', button);
    return () => {
      canvas.removeEventListener('wheel', wheel, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('measureit:zoom', button);
    };
  }, [camera, gl, controls, invalidate, syncView]);
  if (mode === 'orbit') {
    return (
      <OrbitControls
        makeDefault
        enableRotate={!disabled}
        enablePan={!disabled}
        zoomToCursor
        onChange={syncView}
        enableDamping
        dampingFactor={0.1}
      />
    );
  }

  return (
    <MapControls
      makeDefault
      enablePan={!disabled}
      zoomToCursor
      onChange={syncView}
      enableRotate={false}
      enableDamping={false}
      screenSpacePanning
      minZoom={0.05}
      maxZoom={50}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: undefined as unknown as THREE.MOUSE,
      }}
    />
  );
}

/**
 * Sets up an orthographic camera looking at the image plane.
 * Call fitToImage once when image is loaded to center and fit the image in view.
 *
 * Key detail: MapControls has its own `target` that determines where the camera
 * looks. We must sync it with the camera position so the camera looks straight
 * down -Z at the image plane (not towards the default origin).
 */
export function useImageCamera() {
  // gl and camera are stable references. controls changes once (null → MapControls).
  // We read gl.domElement dimensions at call time to avoid re-fitting on resize.
  const { camera, gl, controls } = useThree();

  const fitToImage = useCallback(
    (imageWidth: number, imageHeight: number) => {
      if (!(camera instanceof THREE.OrthographicCamera)) return;

      // Read actual canvas dimensions at call time (not reactive)
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Calculate zoom so image fills ~90% of viewport
      const zoomX = rect.width / imageWidth;
      const zoomY = rect.height / imageHeight;
      const zoom = Math.min(zoomX, zoomY) * 0.9;

      const cx = imageWidth / 2;
      const cy = -imageHeight / 2;

      camera.zoom = zoom;
      camera.position.set(cx, cy, 100);
      camera.lookAt(cx, cy, 0);
      camera.updateProjectionMatrix();

      // Sync MapControls target so the camera looks straight down at the image
      if (controls && 'target' in controls) {
        (controls.target as THREE.Vector3).set(cx, cy, 0);
        (controls as unknown as { update: () => void }).update();
      }
    },
    [camera, gl, controls]
  );

  return { fitToImage };
}
