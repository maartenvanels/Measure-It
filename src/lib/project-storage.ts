import type { AnyMeasurement, Unit } from '@/types/measurement';
import type { SceneObject, SerializedSceneObject } from '@/types/scene-object';
import { refreshCombinedTotals } from '@/stores/useMeasurementStore';
import { createAssetUrl } from './runtime-assets';
import { migrateWorldMeasurement } from './source-coordinates';

export interface ProjectDocument {
  version: 3; id: string; name: string; objects: SerializedSceneObject[];
  measurements: AnyMeasurement[]; referenceValue: number; referenceUnit: Unit; updatedAt: number;
}
export interface ProjectSummary { id: string; name: string; updatedAt: number; measurementCount: number }
const units = new Set(['mm', 'cm', 'm', 'in', 'px']);
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid project data.');
  return value as Record<string, unknown>;
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function point(value: unknown, dimensions = 2) {
  const p = record(value);
  if (!finite(p.x) || !finite(p.y) || (dimensions === 3 && !finite(p.z))) throw new Error('Invalid measurement coordinates.');
}
export function validateProject(value: unknown): ProjectDocument {
  const raw = record(value);
  if (raw.version !== undefined && ![2, 3].includes(raw.version as number)) throw new Error('Unsupported project version.');
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.measurements)) throw new Error('Invalid project document.');
  if (raw.version != null && !Array.isArray(raw.objects)) throw new Error('Project sources are missing.');
  const ids = new Set<string>();
  const objects = (Array.isArray(raw.objects) ? raw.objects : []).map(value => {
    const o = record(value);
    if (typeof o.id !== 'string' || ids.has(o.id) || typeof o.name !== 'string' || !['image', 'model'].includes(o.type as string)) throw new Error('Invalid or duplicate source.');
    ids.add(o.id);
    const t = record(o.transform);
    for (const key of ['position', 'rotation', 'scale']) {
      const vector = t[key];
      if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(finite)) throw new Error('Invalid source transform.');
    }
    if ((t.scale as number[]).some(v => v === 0)) throw new Error('Source scale cannot be zero.');
    if (!finite(o.referenceValue) || o.referenceValue <= 0 || !units.has(o.referenceUnit as string)) throw new Error('Invalid calibration.');
    if (o.imageDataUrl != null && (typeof o.imageDataUrl !== 'string' || !o.imageDataUrl.startsWith('data:image/'))) throw new Error('Invalid image asset.');
    if (o.modelDataUrl != null && (typeof o.modelDataUrl !== 'string' || !o.modelDataUrl.startsWith('data:'))) throw new Error('Invalid model asset.');
    if (o.modelFileType != null && !['glb', 'stl'].includes(o.modelFileType as string)) throw new Error('Unsupported model format.');
    if (o.modelBlob != null && !(o.modelBlob instanceof Blob)) throw new Error('Invalid model asset.');
    return o as unknown as SerializedSceneObject;
  });
  const measurementIds = new Set<string>();
  const measurements = raw.measurements.map(value => {
    let m = { ...record(value) };
    if (m.type === 'measure3d' || m.type === 'reference3d') {
      m = { ...m, type: m.type === 'reference3d' ? 'reference' : 'measure', surface: 'model',
        start3D: m.start, end3D: m.end, start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, pixelLength: m.distance };
    }
    if (typeof m.id !== 'string' || measurementIds.has(m.id)) throw new Error('Invalid or duplicate measurement.');
    measurementIds.add(m.id);
    if (m.surfaceId != null && (typeof m.surfaceId !== 'string' || !ids.has(m.surfaceId))) throw new Error('A measurement refers to a missing source.');
    if (m.unitOverride != null && !units.has(m.unitOverride as string)) throw new Error('Invalid measurement unit.');
    if (m.type === 'reference' || m.type === 'measure') {
      point(m.start); point(m.end);
      if (!finite(m.pixelLength) || m.pixelLength < 0) throw new Error('Invalid measurement length.');
      if (m.surface === 'model') { point(m.start3D, 3); point(m.end3D, 3); }
      if (m.combinedFrom != null && (!Array.isArray(m.combinedFrom) || !m.combinedFrom.every(id => typeof id === 'string'))) throw new Error('Invalid combined measurement.');
    } else if (m.type === 'area') {
      if (!Array.isArray(m.points) || !finite(m.pixelArea)) throw new Error('Invalid area.');
      m.points.forEach(p => point(p));
      if (m.center) point(m.center);
      if (m.radius != null && (!finite(m.radius) || m.radius < 0)) throw new Error('Invalid circle.');
      m.areaKind ??= 'polygon';
    } else if (m.type === 'angle') {
      point(m.vertex); point(m.armA); point(m.armB);
      if (!finite(m.angleDeg)) throw new Error('Invalid angle.');
    } else if (m.type === 'annotation') {
      point(m.position); if (m.arrowTarget) point(m.arrowTarget);
      if (typeof m.content !== 'string') throw new Error('Invalid annotation.');
    } else throw new Error('Unknown measurement type.');
    const typed = m as unknown as AnyMeasurement;
    return raw.version === 2 ? migrateWorldMeasurement(typed, objects.find(o => o.id === typed.surfaceId)) : typed;
  });
  for (const m of measurements) {
    if (m.type === 'measure' && m.combinedFrom?.some(id => !measurementIds.has(id) || id === m.id)) throw new Error('Combined measurement contains missing parts.');
  }
  return { version: 3, id: raw.id, name: raw.name, objects, measurements: refreshCombinedTotals(measurements),
    updatedAt: finite(raw.updatedAt) ? raw.updatedAt : 0,
    referenceValue: finite(raw.referenceValue) && raw.referenceValue > 0 ? raw.referenceValue : 100,
    referenceUnit: units.has(raw.referenceUnit as string) ? raw.referenceUnit as Unit : 'mm' };
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('measureit-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser storage is unavailable.'));
    request.onblocked = () => reject(new Error('Close other MeasureIt tabs and try again.'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const request = action(tx.objectStore('projects'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Could not save the project. Check available browser storage.')); };
  });
}
export async function writeProject(project: ProjectDocument) {
  validateProject(project);
  await transaction('readwrite', store => store.put(project));
}
export async function readProject(id: string): Promise<ProjectDocument> {
  const stored = await transaction('readonly', store => store.get(id));
  if (stored) return validateProject(stored);
  const legacy = localStorage.getItem('measureit_projects_' + id);
  if (!legacy) throw new Error('Project not found.');
  return validateProject(JSON.parse(legacy));
}
export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = new Map<string, ProjectDocument>();
  const stored = await transaction('readonly', store => store.getAll());
  for (const value of stored) {
    try { const p = validateProject(value); projects.set(p.id, p); } catch { /* Do not hide other projects. */ }
  }
  let legacy: { ids?: string[] } = {};
  try { legacy = JSON.parse(localStorage.getItem('measureit_projects_index') ?? '{}'); } catch { /* Keep old data intact. */ }
  for (const id of legacy.ids ?? []) {
    if (projects.has(id)) continue;
    try { const p = validateProject(JSON.parse(localStorage.getItem('measureit_projects_' + id) ?? 'null')); projects.set(id, p); } catch { /* Keep legacy entries intact. */ }
  }
  return [...projects.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(p => ({
    id: p.id, name: p.name, updatedAt: p.updatedAt, measurementCount: p.measurements.length,
  }));
}
export async function deleteProject(id: string) {
  await transaction('readwrite', store => store.delete(id));
  localStorage.removeItem('measureit_projects_' + id);
}
export async function serializeObjects(objects: SceneObject[]): Promise<SerializedSceneObject[]> {
  return Promise.all(objects.map(async o => {
    const modelBlob = o.modelBlob ?? (o.modelUrl ? await fetch(o.modelUrl).then(r => { if (!r.ok) throw new Error('Could not read model ' + o.name); return r.blob(); }) : undefined);
    if (o.type === 'model' && !modelBlob) throw new Error('Re-import the missing model before saving: ' + o.name);
    return { id: o.id, type: o.type, name: o.name, imageDataUrl: o.imageDataUrl, modelBlob,
      modelFileType: o.modelFileType, transform: structuredClone(o.transform), visible: o.visible,
      locked: o.locked, referenceValue: o.referenceValue, referenceUnit: o.referenceUnit, order: o.order };
  }));
}
export async function prepareProject(project: ProjectDocument): Promise<{ objects: SceneObject[]; missingModels: string[] }> {
  const missingModels: string[] = [];
  const decoded = await Promise.all(project.objects.map(async o => {
    let image: HTMLImageElement | undefined;
    if (o.type === 'image') {
      if (!o.imageDataUrl) throw new Error('Missing image: ' + o.name);
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Cannot decode image: ' + o.name));
        img.src = o.imageDataUrl!;
      });
    }
    const modelBlob = o.modelBlob ?? (o.modelDataUrl ? await fetch(o.modelDataUrl).then(r => r.blob()) : undefined);
    if (o.type === 'model' && !modelBlob) missingModels.push(o.name);
    return { ...o, image, modelBlob };
  }));
  return { objects: decoded.map(o => ({ ...o, createdAt: project.updatedAt,
    modelUrl: o.modelBlob ? createAssetUrl(o.modelBlob) : undefined,
    visible: o.type === 'model' && !o.modelBlob ? false : o.visible,
  })), missingModels };
}
export async function portableProject(project: ProjectDocument): Promise<string> {
  const objects = await Promise.all(project.objects.map(async ({ modelBlob, ...o }) => {
    if (!modelBlob) return o;
    const modelDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Cannot export model.'));
      reader.readAsDataURL(modelBlob);
    });
    return { ...o, modelDataUrl };
  }));
  return JSON.stringify({ ...project, objects });
}
