'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { replaceDocument, resetDocumentHistory, useDocumentHistory } from '@/lib/document-history';
import { readProject, writeProject, listProjects, deleteProject, serializeObjects, prepareProject, validateProject, portableProject, type ProjectDocument } from '@/lib/project-storage';
import { downloadText } from '@/lib/export-utils';

async function captureProject(name?: string): Promise<ProjectDocument> {
  const meta = useProjectStore.getState();
  const state = useMeasurementStore.getState();
  const objects = useSceneObjectStore.getState().objects;
  return { version: 3, id: meta.id ?? crypto.randomUUID(), name: name ?? meta.name,
    objects: await serializeObjects(objects), measurements: state.measurements,
    referenceValue: state.referenceValue, referenceUnit: state.referenceUnit, updatedAt: Date.now() };
}
let loadGeneration = 0;
export function useLocalStorage() {
  const saveProject = useCallback(async (name?: string) => {
    const revision = useDocumentHistory.getState().revision;
    const project = await captureProject(name);
    await writeProject(project);
    useProjectStore.setState({ id: project.id, name: project.name, savedAt: project.updatedAt, savedRevision: revision });
    return project;
  }, []);
  const loadProject = useCallback(async (id: string, imported?: unknown) => {
    const generation = ++loadGeneration;
    const project = imported === undefined ? await readProject(id) : validateProject(imported);
    const prepared = await prepareProject(project);
    if (generation !== loadGeneration) return null;
    useCanvasStore.getState().reset();
    useUIStore.setState({ mode: 'none', selectedMeasurementId: null, selectedMeasurementIds: [], cropMode: false, cropBounds: null });
    replaceDocument({ objects: prepared.objects, measurements: project.measurements,
      referenceValue: project.referenceValue, referenceUnit: project.referenceUnit });
    resetDocumentHistory();
    useProjectStore.setState({ id: imported === undefined ? project.id : null, name: project.name,
      savedAt: imported === undefined ? project.updatedAt : null,
      savedRevision: imported === undefined ? useDocumentHistory.getState().revision : -1 });
    if (prepared.missingModels.length) toast.warning('This older project did not store its model files. Re-import: ' + prepared.missingModels.join(', '));
    return project;
  }, []);
  const exportProject = useCallback(async () => {
    const project = await captureProject();
    downloadText(await portableProject(project), project.name.replace(/[^\w -]/g, '_') + '.measureit', 'application/json');
  }, []);
  return { saveProject, loadProject, listProjects, deleteProject, exportProject };
}
