import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useSceneInteraction } from '@/hooks/useSceneInteraction';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { useUIStore } from '@/stores/useUIStore';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';

vi.mock('@react-three/fiber', async () => {
  const T = await import('three');
  return { useThree: () => ({ camera: new T.OrthographicCamera(), gl: {
    domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
  } }) };
});
let interaction: ReturnType<typeof useSceneInteraction>;
const source = new THREE.Group();
function Harness() {
  const result = useSceneInteraction();
  // SSR exposes event callbacks to this test; there is no interactive React tree.
  // eslint-disable-next-line react-hooks/globals
  interaction = result;
  return null;
}
function event(x: number, y: number): ThreeEvent<PointerEvent> {
  return { point: new THREE.Vector3(x, -y, 0), object: source, button: 0, stopPropagation: vi.fn(),
    nativeEvent: { shiftKey: false } } as unknown as ThreeEvent<PointerEvent>;
}
beforeEach(() => {
  useCanvasStore.getState().reset();
  useSceneObjectStore.getState().reset();
  useMeasurementStore.setState({ measurements: [], past: [], future: [] });
  const id = useSceneObjectStore.getState().addImage({ width: 100, height: 100 } as HTMLImageElement, 'fixture');
  source.userData.objectId = id;
  useUIStore.setState({ mode: 'measure', cropMode: false, gridEnabled: false, arrowDrawAnnotationId: null });
  renderToStaticMarkup(createElement(Harness));
});
describe('click-click measurements', () => {
  it('starts on one click and commits only on the second click', () => {
    interaction.onPointerDown(event(10, 20));
    expect(useCanvasStore.getState().isDrawing).toBe(true);
    expect(useMeasurementStore.getState().measurements).toHaveLength(0);
    interaction.onPointerMove(event(70, 20));
    expect(useMeasurementStore.getState().measurements).toHaveLength(0);
    interaction.onPointerDown(event(70, 20));
    expect(useCanvasStore.getState().isDrawing).toBe(false);
    expect(useMeasurementStore.getState().measurements[0]).toMatchObject({
      start: { x: 10, y: 20 }, end: { x: 70, y: 20 }, pixelLength: 60, surfaceId: source.userData.objectId,
    });
  });
  it('keeps chain segments connected and rejects zero-length clicks', () => {
    useUIStore.setState({ mode: 'measure-chain' });
    interaction.onPointerDown(event(0, 0));
    interaction.onPointerDown(event(0, 0));
    expect(useMeasurementStore.getState().measurements).toHaveLength(0);
    interaction.onPointerDown(event(30, 0));
    interaction.onPointerDown(event(60, 0));
    expect(useMeasurementStore.getState().measurements).toHaveLength(2);
    expect(useCanvasStore.getState().drawStart?.x).toBeCloseTo(60);
    expect(useCanvasStore.getState().drawStart?.y).toBeCloseTo(0);
  });
});
