import { create } from 'zustand';
import type { Unit } from '@/types/measurement';
import type { SceneObject, ModelFileType, ObjectTransform } from '@/types/scene-object';
import { DEFAULT_TRANSFORM } from '@/types/scene-object';
import * as THREE from 'three';

interface SceneObjectState {
  objects: SceneObject[];
  activeObjectId: string | null;
  selectedObjectId: string | null;
  transformMode: 'translate' | 'rotate' | 'scale';

  // Undo/redo history for object transforms (and other persistent changes)
  past: SceneObject[][];
  future: SceneObject[][];
  /** Timestamp of last push, used by the Ctrl+Z router to pick the most recent action. */
  lastChangeAt: number;
  pushHistory: () => void;
  undo: () => boolean;
  redo: () => boolean;

  // Object ref registry for TransformControls
  objectRefs: Map<string, React.RefObject<THREE.Group | null>>;

  // Actions
  addImage: (image: HTMLImageElement, fileName: string, dataUrl?: string) => string;
  addModel: (url: string, fileName: string, fileType: ModelFileType) => string;
  removeObject: (id: string) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  setTransform: (id: string, transform: Partial<ObjectTransform>) => void;
  setActiveObject: (id: string | null) => void;
  selectObject: (id: string | null) => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  toggleObjectVisibility: (id: string) => void;
  toggleObjectLocked: (id: string) => void;
  setObjectReferenceValue: (id: string, value: number) => void;
  setObjectReferenceUnit: (id: string, unit: Unit) => void;

  // Ref registry
  registerRef: (id: string, ref: React.RefObject<THREE.Group | null>) => void;
  unregisterRef: (id: string) => void;

  // Getters
  getObject: (id: string) => SceneObject | undefined;
  getImages: () => SceneObject[];
  getModels: () => SceneObject[];
  getActiveObject: () => SceneObject | undefined;
  getActiveImage: () => HTMLImageElement | null;
  getFirstVisibleImage: () => HTMLImageElement | null;
  hasContent: () => boolean;
  hasModels: () => boolean;

  reset: () => void;
}

export const useSceneObjectStore = create<SceneObjectState>((set, get) => ({
  objects: [],
  activeObjectId: null,
  selectedObjectId: null,
  transformMode: 'translate',
  past: [],
  future: [],
  lastChangeAt: 0,
  objectRefs: new Map(),

  pushHistory: () => {
    const { objects, past } = get();
    set({
      past: [...past, objects].slice(-50),
      future: [],
      lastChangeAt: Date.now(),
    });
  },

  undo: () => {
    const { past, future, objects } = get();
    if (past.length === 0) return false;
    const previous = past[past.length - 1];
    set({
      objects: previous,
      past: past.slice(0, -1),
      future: [objects, ...future].slice(0, 50),
    });
    return true;
  },

  redo: () => {
    const { past, future, objects } = get();
    if (future.length === 0) return false;
    const next = future[0];
    set({
      objects: next,
      past: [...past, objects].slice(-50),
      future: future.slice(1),
    });
    return true;
  },

  addImage: (image, fileName, dataUrl) => {
    const id = crypto.randomUUID();
    const { objects } = get();

    // Auto-position: place new images side by side
    const existingImages = objects.filter((o) => o.type === 'image');
    let offsetX = 0;
    for (const img of existingImages) {
      if (img.image) {
        offsetX += img.image.width * img.transform.scale[0] + 100;
      }
    }

    const obj: SceneObject = {
      id,
      type: 'image',
      name: fileName,
      image,
      imageDataUrl: dataUrl,
      transform: {
        ...DEFAULT_TRANSFORM,
        position: [offsetX, 0, 0],
      },
      visible: true,
      locked: false,
      referenceValue: 100,
      referenceUnit: 'mm',
      createdAt: Date.now(),
      order: objects.length,
    };

    set({
      objects: [...objects, obj],
      activeObjectId: id,
      selectedObjectId: id,
    });
    return id;
  },

  addModel: (url, fileName, fileType) => {
    const id = crypto.randomUUID();
    const { objects } = get();

    const obj: SceneObject = {
      id,
      type: 'model',
      name: fileName,
      modelUrl: url,
      modelFileType: fileType,
      transform: { ...DEFAULT_TRANSFORM },
      visible: true,
      locked: false,
      referenceValue: 100,
      referenceUnit: 'mm',
      createdAt: Date.now(),
      order: objects.length,
    };

    set({
      objects: [...objects, obj],
      activeObjectId: id,
      selectedObjectId: id,
    });
    return id;
  },

  removeObject: (id) => {
    const { objects, activeObjectId, selectedObjectId } = get();
    // Asset lifetime is managed by document history, including undo/redo snapshots.

    const remaining = objects.filter((o) => o.id !== id);
    set({
      objects: remaining,
      activeObjectId: activeObjectId === id ? (remaining[0]?.id ?? null) : activeObjectId,
      selectedObjectId: selectedObjectId === id ? null : selectedObjectId,
    });
  },

  updateObject: (id, patch) => {
    set({
      objects: get().objects.map((o) =>
        o.id === id ? { ...o, ...patch } : o
      ),
    });
  },

  setTransform: (id, transform) => {
    set({
      objects: get().objects.map((o) =>
        o.id === id
          ? { ...o, transform: { ...o.transform, ...transform } }
          : o
      ),
    });
  },

  setActiveObject: (id) => set({ activeObjectId: id }),
  selectObject: (id) => set({ selectedObjectId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),

  toggleObjectVisibility: (id) => {
    set({
      objects: get().objects.map((o) =>
        o.id === id ? { ...o, visible: !o.visible } : o
      ),
    });
  },

  toggleObjectLocked: (id) => {
    set({
      objects: get().objects.map((o) =>
        o.id === id ? { ...o, locked: !o.locked } : o
      ),
    });
  },

  setObjectReferenceValue: (id, value) => {
    set({
      objects: get().objects.map((o) =>
        o.id === id ? { ...o, referenceValue: value } : o
      ),
    });
  },

  setObjectReferenceUnit: (id, unit) => {
    set({
      objects: get().objects.map((o) =>
        o.id === id ? { ...o, referenceUnit: unit } : o
      ),
    });
  },

  registerRef: (id, ref) => {
    const refs = new Map(get().objectRefs);
    refs.set(id, ref);
    set({ objectRefs: refs });
  },

  unregisterRef: (id) => {
    const refs = new Map(get().objectRefs);
    refs.delete(id);
    set({ objectRefs: refs });
  },

  getObject: (id) => get().objects.find((o) => o.id === id),
  getImages: () => get().objects.filter((o) => o.type === 'image'),
  getModels: () => get().objects.filter((o) => o.type === 'model'),
  getActiveObject: () => {
    const { objects, activeObjectId } = get();
    return activeObjectId ? objects.find((o) => o.id === activeObjectId) : undefined;
  },
  getActiveImage: () => {
    const obj = get().getActiveObject();
    return (obj?.type === 'image' ? obj.image : null) ?? null;
  },
  getFirstVisibleImage: () => {
    const img = get().objects.find((o) => o.type === 'image' && o.visible);
    return img?.image ?? null;
  },
  hasContent: () => get().objects.length > 0,
  hasModels: () => get().objects.some((o) => o.type === 'model'),

  reset: () => {
    set({
      objects: [],
      activeObjectId: null,
      selectedObjectId: null,
      objectRefs: new Map(),
    });
  },
}));
