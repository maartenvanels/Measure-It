import type { Unit } from './measurement';

export type SceneObjectType = 'image' | 'model';
export type ModelFileType = 'glb' | 'stl';

export interface ObjectTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export const DEFAULT_TRANSFORM: ObjectTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export interface SceneObject {
  id: string;
  type: SceneObjectType;
  name: string;

  // Image-specific
  image?: HTMLImageElement;
  imageDataUrl?: string;

  // Model-specific
  modelUrl?: string;
  modelBlob?: Blob;
  modelFileType?: ModelFileType;

  // Transform
  transform: ObjectTransform;

  // State
  visible: boolean;
  locked: boolean;

  // Per-object reference scale
  referenceValue: number;
  referenceUnit: Unit;

  createdAt: number;
  order: number;
}

/** Serializable version for save/load (no HTMLImageElement or blob URLs) */
export interface SerializedSceneObject {
  id: string;
  type: SceneObjectType;
  name: string;
  imageDataUrl?: string;
  modelFileType?: ModelFileType;
  modelBlob?: Blob;
  modelDataUrl?: string;
  transform: ObjectTransform;
  visible: boolean;
  locked: boolean;
  referenceValue: number;
  referenceUnit: Unit;
  order: number;
}
