export type MeasurementType = 'reference' | 'measure' | 'angle' | 'area' | 'annotation';
export type DrawMode =
  | 'none'
  | 'reference' | 'measure' | 'measure-chain' | 'angle'
  | 'area' | 'area-polygon' | 'area-freehand' | 'area-circle-3pt' | 'area-circle-center'
  | 'annotation';

/** Check if a DrawMode is any measure sub-mode (single or chain). */
export function isMeasureMode(mode: DrawMode): boolean {
  return mode === 'measure' || mode === 'measure-chain';
}
export type Unit = 'mm' | 'cm' | 'm' | 'in' | 'px';

/** Which surface a measurement was drawn on */
export type MeasurementSurface = 'image' | 'model';

export type AreaKind = 'polygon' | 'freehand' | 'circle-3pt' | 'circle-center';

/** Check if a DrawMode is any area sub-mode */
export function isAreaMode(mode: DrawMode): boolean {
  return mode === 'area' || mode.startsWith('area-');
}

/** Get the category of a DrawMode */
export function modeCategory(mode: DrawMode): string {
  if (mode === 'none') return 'none';
  if (isAreaMode(mode)) return 'area';
  if (mode === 'reference' || mode === 'measure' || mode === 'angle') return 'measure';
  if (mode === 'annotation') return 'annotate';
  return 'other';
}

export interface Point {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Unified measurement for both 2D image and 3D model surfaces.
 *
 * For image measurements (surface='image' or undefined):
 *   start/end are image-space 2D points, pixelLength is the pixel distance.
 *
 * For model measurements (surface='model'):
 *   start3D/end3D are 3D world points, distance is the 3D Euclidean distance.
 *   pixelLength is set equal to distance for unified calculations.
 *   start/end are set to {x:0,y:0} (not used for rendering).
 */
export interface Measurement {
  id: string;
  type: 'reference' | 'measure';
  start: Point;
  end: Point;
  pixelLength: number;
  name: string;
  createdAt: number;
  color?: string;
  unitOverride?: Unit;
  labelOffset?: Point;
  nameLabelOffset?: Point;
  fontSize?: number;
  /** Which surface this measurement lives on */
  surface?: MeasurementSurface;
  /** 3D start point (present when surface='model') */
  start3D?: Point3D;
  /** 3D end point (present when surface='model') */
  end3D?: Point3D;
  /** 3D Euclidean distance (present when surface='model') */
  distance?: number;
  /** Hidden in scene (undefined = visible) */
  visible?: boolean;
  /** Locked from editing (undefined = unlocked) */
  locked?: boolean;
  /** Links to a specific SceneObject.id */
  surfaceId?: string;
  /** If present, this is a virtual sum of the listed constituent measurement ids. */
  combinedFrom?: string[];
  /** Missing operation in older projects means sum. Area is length × width. */
  combineOperation?: 'sum' | 'area';
  combinedPixelArea?: number;
}

export interface AngleMeasurement {
  id: string;
  type: 'angle';
  vertex: Point;
  armA: Point;
  armB: Point;
  angleDeg: number;
  name: string;
  createdAt: number;
  color?: string;
  labelOffset?: Point;
  nameLabelOffset?: Point;
  fontSize?: number;
  /** Hidden in scene (undefined = visible) */
  visible?: boolean;
  /** Locked from editing (undefined = unlocked) */
  locked?: boolean;
  /** Links to a specific SceneObject.id */
  surfaceId?: string;
}

export interface AreaMeasurement {
  id: string;
  type: 'area';
  areaKind: AreaKind;
  points: Point[];
  pixelArea: number;
  name: string;
  createdAt: number;
  color?: string;
  unitOverride?: Unit;
  labelOffset?: Point;
  nameLabelOffset?: Point;
  fontSize?: number;
  // Circle-specific fields (only for circle-3pt and circle-center)
  center?: Point;
  radius?: number;
  /** Hidden in scene (undefined = visible) */
  visible?: boolean;
  /** Locked from editing (undefined = unlocked) */
  locked?: boolean;
  /** Links to a specific SceneObject.id */
  surfaceId?: string;
}

export interface Annotation {
  id: string;
  type: 'annotation';
  position: Point;
  content: string;
  name?: string;
  color?: string;
  createdAt: number;
  fontSize?: number;
  arrowTarget?: Point;
  /** Hidden in scene (undefined = visible) */
  visible?: boolean;
  /** Locked from editing (undefined = unlocked) */
  locked?: boolean;
  /** Links to a specific SceneObject.id */
  surfaceId?: string;
}

/**
 * @deprecated Use Measurement with surface='model' instead.
 * Kept temporarily for migration of stored data.
 */
export interface Measurement3D {
  id: string;
  type: 'reference3d' | 'measure3d';
  start: Point3D;
  end: Point3D;
  distance: number;
  name: string;
  createdAt: number;
  color?: string;
  unitOverride?: Unit;
  fontSize?: number;
  labelOffset?: Point;
  nameLabelOffset?: Point;
}

export type AnyMeasurement = Measurement | AngleMeasurement | AreaMeasurement | Annotation;

/** Check if measurement is visible (undefined defaults to true) */
export function isMeasurementVisible(m: AnyMeasurement): boolean {
  return m.visible !== false;
}

/** Check if measurement is locked (undefined defaults to false) */
export function isMeasurementLocked(m: AnyMeasurement): boolean {
  return m.locked === true;
}

/**
 * Legacy type union that includes Measurement3D for migration.
 * Use AnyMeasurement for new code.
 */
export type LegacyMeasurement = AnyMeasurement | Measurement3D;

export interface LabelBounds {
  measurementId: string;
  labelType: 'value' | 'name';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewTransform {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface MeasurementExport {
  name: string;
  type: MeasurementType;
  pixelLength: number;
  realValue: number | null;
  unit: Unit;
  coordinates: { x1: number; y1: number; x2: number; y2: number };
}

export interface SavedProject {
  id: string;
  name: string;
  measurements: (AnyMeasurement | Measurement3D)[];
  referenceValue: number;
  referenceUnit: Unit;
  updatedAt: number;
}

/** V2 project format with multi-object scene support */
export interface SavedProjectV2 {
  version: 2;
  id: string;
  name: string;
  objects: import('@/types/scene-object').SerializedSceneObject[];
  measurements: AnyMeasurement[];
  updatedAt: number;
}
