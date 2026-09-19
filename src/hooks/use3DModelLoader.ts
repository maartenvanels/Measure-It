'use client';

import { useCallback } from 'react';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { createAssetUrl } from '@/lib/runtime-assets';

const MODEL_EXTENSIONS: Record<string, 'glb' | 'stl'> = {
  '.glb': 'glb',
  '.gltf': 'glb',
  '.stl': 'stl',
};

function getModelFileType(fileName: string): 'glb' | 'stl' | null {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  return MODEL_EXTENSIONS[ext] ?? null;
}

export function isModelFile(file: File): boolean {
  return getModelFileType(file.name) !== null;
}

export function use3DModelLoader() {
  const addModel = useSceneObjectStore((s) => s.addModel);

  const loadFromFile = useCallback(
    (file: File) => {
      const fileType = getModelFileType(file.name);
      if (!fileType) return;

      const url = createAssetUrl(file);
      const id = addModel(url, file.name, fileType);
      useSceneObjectStore.getState().updateObject(id, { modelBlob: file });
    },
    [addModel]
  );

  const loadFromDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && isModelFile(file)) {
        loadFromFile(file);
        return true;
      }
      return false;
    },
    [loadFromFile]
  );

  return { loadFromFile, loadFromDrop };
}
