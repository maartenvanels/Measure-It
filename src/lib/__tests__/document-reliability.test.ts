import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useMeasurementStore as measures } from '@/stores/useMeasurementStore';
import { useSceneObjectStore as scene } from '@/stores/useSceneObjectStore';
import { initializeDocumentHistory, resetDocumentHistory, undoDocument, redoDocument, beginDocumentEdit, endDocumentEdit, useDocumentHistory } from '../document-history';
import { generateJSON, generateCSV, generateClipboardText, buildSimpleResolver } from '../export-utils';
import { calcRealValue, calcRealArea } from '../calculations';
import { validateProject, serializeObjects, prepareProject, type ProjectDocument } from '../project-storage';
import { sourceMatrix, localPoint } from '../source-coordinates';
import { zoomCameraAt } from '../view-navigation';
import type { Measurement } from '@/types/measurement';

const line = (id: string, length = 10, extras: Partial<Measurement> = {}): Measurement => ({
  id, type: 'measure', name: id, createdAt: 0,
  start: { x: 0, y: 0 }, end: { x: length, y: 0 }, pixelLength: length, ...extras,
});
initializeDocumentHistory();
beforeEach(() => {
  scene.getState().reset();
  measures.setState({ measurements: [], past: [], future: [], referenceValue: 100, referenceUnit: 'mm' });
  resetDocumentHistory();
});
describe('measurement result contracts', () => {
  it('combines two dimensions into an area and updates it after editing', () => {
    measures.setState({ measurements: [line('a', 20), line('b', 30)] });
    const result = measures.getState().combineMeasurements(['a', 'b'], 'area');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    const area = () => measures.getState().measurements.find(m => m.id === result.id) as Measurement;
    expect(area().combinedPixelArea).toBe(600);
    measures.getState().updateMeasurement('a', { pixelLength: 40 });
    expect(area().combinedPixelArea).toBe(1200);
    const resolve = buildSimpleResolver(100, 'mm', line('ref', 10, { type: 'reference' }));
    const exported = { ...area(), unitOverride: 'cm' as const };
    expect(JSON.parse(generateJSON([exported], resolve))[0]).toMatchObject({ type: 'area', realArea: 1200, unit: 'cm²' });
    expect(generateCSV([exported], resolve)).toContain('"1200",cm²');
    expect(generateClipboardText([exported], resolve)).toContain('1200.00 cm²');
    expect(calcRealArea(1200, line('ref', 10), 100, 'mm', 'cm')).toBe('1200.00 cm²');
    expect(calcRealArea(1200, line('ref', 10), 100, 'mm', 'px')).toBe('1200.00 px²');
    measures.getState().removeMeasurement('a');
    expect(measures.getState().measurements.some(m => m.id === result.id)).toBe(false);
  });
  it('rejects ambiguous areas and preserves legacy sum behavior', () => {
    measures.setState({ measurements: [line('a', 20), line('b', 30), line('c', 40)] });
    expect(measures.getState().combineMeasurements(['a', 'b', 'c'], 'area').ok).toBe(false);
    const sum = measures.getState().combineMeasurements(['a', 'b']);
    expect(sum.ok).toBe(true);
    if (sum.ok) expect((measures.getState().measurements.find(m => m.id === sum.id) as Measurement).pixelLength).toBe(50);
    measures.getState().updateMeasurement('b', { surfaceId: 'different' });
    expect(measures.getState().combineMeasurements(['a', 'b'], 'area').ok).toBe(false);
  });
  it('only shifts measurements belonging to the cropped source', () => {
    measures.setState({ measurements: [line('a', 10, { surfaceId: 'image-a' }), line('b', 10, { surfaceId: 'image-b' })] });
    measures.getState().adjustAllCoordinates(-5, -3, 'image-a');
    expect((measures.getState().measurements[0] as Measurement).start).toEqual({ x: -5, y: -3 });
    expect((measures.getState().measurements[1] as Measurement).start).toEqual({ x: 0, y: 0 });
  });
  it('exports the same converted value to JSON and CSV, including zero', () => {
    const ref = line('ref', 100, { type: 'reference' });
    const resolve = buildSimpleResolver(100, 'mm', ref);
    const measurement = line('distance', 50, { unitOverride: 'cm' });
    expect(JSON.parse(generateJSON([measurement], resolve))[0]).toMatchObject({ realValue: 5, unit: 'cm' });
    expect(generateCSV([measurement], resolve)).toContain('"5.00",cm');
    expect(JSON.parse(generateJSON([line('zero', 0)], resolve))[0].realValue).toBe(0);
  });
  it('rejects invalid or zero reference lengths instead of producing Infinity', () => {
    expect(calcRealValue(10, line('ref', 0), 100)).toBeNull();
    expect(calcRealArea(100, line('ref', 0), 100, 'mm')).toBeNull();
  });
  it('keeps combined totals current after an endpoint changes', () => {
    measures.getState().addMeasurement(line('a', 10));
    measures.getState().addMeasurement(line('b', 20));
    const combined = measures.getState().combineMeasurements(['a', 'b']);
    expect(combined.ok).toBe(true);
    measures.getState().updateMeasurement('a', { pixelLength: 15, end: { x: 15, y: 0 } });
    if (combined.ok) expect((measures.getState().measurements.find(m => m.id === combined.id) as Measurement).pixelLength).toBe(35);
  });
});
describe('whole-document undo', () => {
  it('undoes measurements and object changes in chronological order', async () => {
    const id = scene.getState().addImage({ width: 100, height: 100 } as HTMLImageElement, 'test');
    await Promise.resolve(); resetDocumentHistory();
    scene.getState().setTransform(id, { position: [20, 0, 0] });
    await Promise.resolve();
    measures.getState().addMeasurement(line('new', 10, { surfaceId: id }));
    await Promise.resolve();
    undoDocument();
    expect(measures.getState().measurements).toHaveLength(0);
    expect(scene.getState().objects[0].transform.position[0]).toBe(20);
    undoDocument();
    expect(scene.getState().objects[0].transform.position[0]).toBe(0);
    redoDocument(); redoDocument();
    expect(measures.getState().measurements).toHaveLength(1);
    expect(scene.getState().objects[0].transform.position[0]).toBe(20);
  });
  it('records an entire drag as one undo and groups source deletion with its measures', async () => {
    const id = scene.getState().addImage({ width: 100, height: 100 } as HTMLImageElement, 'test');
    measures.getState().addMeasurement(line('a', 10, { surfaceId: id }));
    await Promise.resolve(); resetDocumentHistory();
    beginDocumentEdit();
    for (let n = 11; n < 25; n++) { measures.getState().updateMeasurement('a', { pixelLength: n }); await Promise.resolve(); }
    endDocumentEdit();
    expect(useDocumentHistory.getState().past).toHaveLength(1);
    undoDocument();
    expect((measures.getState().measurements[0] as Measurement).pixelLength).toBe(10);
    scene.getState().removeObject(id);
    measures.getState().removeMeasurement('a');
    await Promise.resolve();
    undoDocument();
    expect(scene.getState().objects[0].id).toBe(id);
    expect(measures.getState().measurements[0].surfaceId).toBe(id);
  });
});
describe('project round trip', () => {
  const base = (): ProjectDocument => ({ version: 3, id: 'project', name: 'Fixture', updatedAt: 1,
    referenceValue: 100, referenceUnit: 'mm', objects: [], measurements: [] });
  it('restores image and model identities, model bytes and measurement references', async () => {
    class TestImage {
      width = 100; height = 100; onload?: () => void;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', TestImage);
    try {
      const imageId = scene.getState().addImage(new TestImage() as unknown as HTMLImageElement, 'image.png', 'data:image/png;base64,Zg==');
      const modelId = scene.getState().addModel('', 'fixture.stl', 'stl');
      const bytes = new Blob(['solid fixture\nendsolid fixture']);
      scene.getState().updateObject(modelId, { modelBlob: bytes });
      const project = { ...base(), objects: await serializeObjects(scene.getState().objects),
        measurements: [line('m', 5, { surfaceId: imageId })] };
      const restored = await prepareProject(validateProject(project));
      expect(restored.objects.map(o => o.id)).toEqual([imageId, modelId]);
      expect(project.measurements[0].surfaceId).toBe(restored.objects[0].id);
      expect(await restored.objects[1].modelBlob?.text()).toBe(await bytes.text());
      expect(restored.objects[1].modelUrl).toMatch(/^blob:/);
      expect(restored.objects[1].visible).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
  it('rejects unsupported documents and dangling references before modifying stores', () => {
    measures.getState().addMeasurement(line('existing'));
    expect(() => validateProject({ ...base(), version: 99 })).toThrow('version');
    expect(() => validateProject({ ...base(), measurements: [line('bad', 10, { surfaceId: 'missing' })] })).toThrow('missing source');
    expect(measures.getState().measurements[0].id).toBe('existing');
  });
  it('migrates legacy world points into source coordinates', () => {
    const id = scene.getState().addImage({ width: 100, height: 100 } as HTMLImageElement, 'test');
    scene.getState().setTransform(id, { position: [200, 0, 0] });
    const project = validateProject({ ...base(), version: 2, objects: scene.getState().objects,
      measurements: [line('m', 10, { surfaceId: id, start: { x: 205, y: 5 }, end: { x: 215, y: 5 } })] });
    expect((project.measurements[0] as Measurement).start).toEqual({ x: 5, y: 5 });
  });
});
describe('source coordinates and cursor zoom', () => {
  it('round-trips points through transformed source space', () => {
    const transform = { position: [20, 30, 40], rotation: [0.2, 0.3, 0.5], scale: [2, 2, 2] } as const;
    const source = { transform: { position: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale] } } as Parameters<typeof localPoint>[1];
    const original = new THREE.Vector3(4, 5, 6);
    const world = original.clone().applyMatrix4(sourceMatrix(source!.transform));
    expect(localPoint(world, source).distanceTo(original)).toBeLessThan(1e-10);
  });
  it.each(['ortho', 'perspective'])('keeps the cursor anchor stable for %s zoom', kind => {
    const camera = kind === 'ortho' ? new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000)
      : new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const ndc = new THREE.Vector2(0.3, -0.2);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const anchor = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3())!;
    zoomCameraAt(camera, new THREE.Vector3(), ndc, 1.5);
    const screen = anchor.project(camera);
    expect(screen.x).toBeCloseTo(ndc.x, 8);
    expect(screen.y).toBeCloseTo(ndc.y, 8);
  });
});
