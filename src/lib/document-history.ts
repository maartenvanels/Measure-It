import { create } from 'zustand';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { releaseUnusedAssetUrls } from './runtime-assets';

function snapshot() {
  const m = useMeasurementStore.getState();
  return { objects: useSceneObjectStore.getState().objects, measurements: m.measurements,
    referenceValue: m.referenceValue, referenceUnit: m.referenceUnit };
}
type Snapshot = ReturnType<typeof snapshot>;
export const useDocumentHistory = create<{ past: Snapshot[]; future: Snapshot[]; revision: number }>(() => ({
  past: [], future: [], revision: 0,
}));
let previous = snapshot();
let suspended = false;
let scheduled = false;
let depth = 0;
let initialized = false;
const same = (a: Snapshot, b: Snapshot) => a.objects === b.objects && a.measurements === b.measurements
  && a.referenceValue === b.referenceValue && a.referenceUnit === b.referenceUnit;

function collectAssets() {
  const history = useDocumentHistory.getState();
  const states = [snapshot(), ...history.past, ...history.future];
  releaseUnusedAssetUrls(new Set(states.flatMap(s => s.objects.flatMap(o => o.modelUrl ? [o.modelUrl] : []))));
}
function flush() {
  scheduled = false;
  if (suspended || depth) return;
  const next = snapshot();
  if (same(previous, next)) return;
  useDocumentHistory.setState(s => ({ past: [...s.past, previous].slice(-50), future: [], revision: s.revision + 1 }));
  previous = next;
  collectAssets();
}
export function initializeDocumentHistory() {
  if (initialized) return;
  initialized = true;
  previous = snapshot();
  const changed = () => {
    if (suspended || scheduled || depth) return;
    scheduled = true;
    queueMicrotask(flush);
  };
  useMeasurementStore.subscribe(changed);
  useSceneObjectStore.subscribe(changed);
}
export function beginDocumentEdit() { flush(); depth++; }
export function endDocumentEdit() { depth = Math.max(0, depth - 1); flush(); }
export function resetDocumentHistory() {
  depth = 0;
  previous = snapshot();
  useDocumentHistory.setState(s => ({ past: [], future: [], revision: s.revision + 1 }));
  collectAssets();
}
export function replaceDocument(next: Snapshot) {
  suspended = true;
  try {
    useMeasurementStore.setState({ measurements: next.measurements, referenceValue: next.referenceValue,
      referenceUnit: next.referenceUnit, past: [], future: [] });
    const current = useSceneObjectStore.getState();
    const active = next.objects.some(o => o.id === current.activeObjectId) ? current.activeObjectId : next.objects[0]?.id ?? null;
    useSceneObjectStore.setState({ objects: next.objects, activeObjectId: active,
      selectedObjectId: next.objects.some(o => o.id === current.selectedObjectId) ? current.selectedObjectId : null,
      past: [], future: [] });
    previous = snapshot();
  } finally { suspended = false; }
}
export function undoDocument() {
  depth = 0; flush();
  const { past, future } = useDocumentHistory.getState();
  if (!past.length) return;
  const current = snapshot();
  replaceDocument(past[past.length - 1]);
  useDocumentHistory.setState(s => ({ past: past.slice(0, -1), future: [current, ...future].slice(0, 50), revision: s.revision + 1 }));
  collectAssets();
}
export function redoDocument() {
  depth = 0; flush();
  const { past, future } = useDocumentHistory.getState();
  if (!future.length) return;
  const current = snapshot();
  replaceDocument(future[0]);
  useDocumentHistory.setState(s => ({ past: [...past, current].slice(-50), future: future.slice(1), revision: s.revision + 1 }));
  collectAssets();
}
