import { create } from 'zustand';
import { Point, Point3D, ViewTransform, AngleMeasurement, AreaMeasurement } from '@/types/measurement';
import { pixelDist, snapToAxis, calcAngleDeg, calcPolygonArea, circumscribedCircle, circleArea, simplifyPath } from '@/lib/geometry';
import { useSceneObjectStore } from './useSceneObjectStore';
import { useMeasurementStore } from './useMeasurementStore';

interface CanvasState {
  transform: ViewTransform;
  isDrawing: boolean;
  drawStart: Point | null;
  drawCurrent: Point | null;
  isPanning: boolean;
  panAnchor: Point | null;

  // Pinch-to-zoom state
  pinchStartDist: number | null;
  pinchStartZoom: number | null;

  // Snap state
  snapPoint: Point | null;

  // Angle drawing state
  angleStep: 'vertex' | 'armA' | 'armB' | null;
  angleVertex: Point | null;
  angleArmA: Point | null;

  // Polygon drawing state
  areaPoints: Point[];

  // Freehand drawing state
  freehandPoints: Point[];
  isFreehandDrawing: boolean;

  // Circle-3-point drawing state
  circle3PtPoints: Point[];

  // Circle-center drawing state
  circleCenterPoint: Point | null;

  createBlankCanvas: (width: number, height: number) => void;
  setSnapPoint: (p: Point | null) => void;
  setTransform: (t: Partial<ViewTransform>) => void;
  fitImageToContainer: (containerWidth: number, containerHeight: number) => void;
  zoomAtPoint: (screenX: number, screenY: number, delta: number) => void;
  startDrawing: (imagePoint: Point) => void;
  updateDrawing: (imagePoint: Point, shiftKey: boolean) => void;
  finishDrawing: () => { start: Point; end: Point; pixelLength: number } | null;
  cancelDrawing: () => void;
  startPanning: (screenPoint: Point) => void;
  updatePanning: (screenPoint: Point) => void;
  stopPanning: () => void;

  // Pinch-to-zoom actions
  startPinchZoom: (dist: number) => void;
  updatePinchZoom: (dist: number, centerX: number, centerY: number) => void;
  stopPinchZoom: () => void;

  // Zoom controls
  zoomIn: () => void;
  zoomOut: () => void;

  // Angle drawing actions
  startAngle: () => void;
  placeAnglePoint: (pt: Point) => AngleMeasurement | null;
  cancelAngle: () => void;

  // Area drawing actions
  addAreaPoint: (pt: Point) => void;
  finishArea: () => AreaMeasurement | null;
  cancelArea: () => void;

  // Freehand drawing actions
  startFreehand: (pt: Point) => void;
  addFreehandPoint: (pt: Point) => void;
  finishFreehand: () => AreaMeasurement | null;
  cancelFreehand: () => void;

  // Circle-3-point drawing actions
  addCircle3PtPoint: (pt: Point) => void;
  finishCircle3Pt: () => AreaMeasurement | null;
  cancelCircle3Pt: () => void;

  // Circle-center drawing actions
  startCircleCenter: (center: Point) => void;
  finishCircleCenter: (edgePt: Point) => AreaMeasurement | null;
  cancelCircleCenter: () => void;

  // 3D drawing state
  isDrawing3D: boolean;
  draw3DStart: Point3D | null;
  draw3DCurrent: Point3D | null;

  startDrawing3D: (point: Point3D) => void;
  updateDrawing3D: (point: Point3D) => void;
  finishDrawing3D: () => { start: Point3D; end: Point3D; distance: number } | null;
  cancelDrawing3D: () => void;

  // Crop drawing state + actions
  cropStart: Point | null;
  cropCurrent: Point | null;
  isCropping: boolean;
  startCropDraw: (pt: Point) => void;
  updateCropDraw: (pt: Point) => void;
  finishCropDraw: () => { x: number; y: number; w: number; h: number } | null;
  cancelCropDraw: () => void;
  applyCrop: (bounds: { x: number; y: number; w: number; h: number }) => void;
  reset: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  transform: { panX: 0, panY: 0, zoom: 1 },
  isDrawing: false,
  drawStart: null,
  drawCurrent: null,
  isPanning: false,
  panAnchor: null,

  // Pinch-to-zoom
  pinchStartDist: null,
  pinchStartZoom: null,

  // Snap
  snapPoint: null,

  // Angle drawing
  angleStep: null,
  angleVertex: null,
  angleArmA: null,

  // Polygon drawing
  areaPoints: [],

  // Freehand drawing
  freehandPoints: [],
  isFreehandDrawing: false,

  // Circle-3-point drawing
  circle3PtPoints: [],

  // Circle-center drawing
  circleCenterPoint: null,

  // 3D drawing
  isDrawing3D: false,
  draw3DStart: null,
  draw3DCurrent: null,

  // Crop drawing
  cropStart: null,
  cropCurrent: null,
  isCropping: false,

  createBlankCanvas: (width, height) => {
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const dataUrl = offscreen.toDataURL('image/png');
    const img = new window.Image();
    img.onload = () => {
      useSceneObjectStore.getState().addImage(img, 'Blank Canvas', dataUrl);
    };
    img.src = dataUrl;
  },
  setSnapPoint: (p) => set({ snapPoint: p }),

  setTransform: (t) =>
    set({ transform: { ...get().transform, ...t } }),

  fitImageToContainer: (containerWidth, containerHeight) => {
    const image = useSceneObjectStore.getState().getFirstVisibleImage();
    if (!image) return;
    const scaleX = containerWidth / image.width;
    const scaleY = containerHeight / image.height;
    const zoom = Math.min(scaleX, scaleY) * 0.9;
    set({
      transform: {
        panX: (containerWidth - image.width * zoom) / 2,
        panY: (containerHeight - image.height * zoom) / 2,
        zoom,
      },
    });
  },

  zoomAtPoint: (screenX, screenY, delta) => {
    const { transform } = get();
    const zoomFactor = delta < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.05, Math.min(transform.zoom * zoomFactor, 50));
    set({
      transform: {
        panX: screenX - (screenX - transform.panX) * (newZoom / transform.zoom),
        panY: screenY - (screenY - transform.panY) * (newZoom / transform.zoom),
        zoom: newZoom,
      },
    });
  },

  startDrawing: (imagePoint) =>
    set({ isDrawing: true, drawStart: imagePoint, drawCurrent: imagePoint }),

  updateDrawing: (imagePoint, shiftKey) => {
    const { drawStart } = get();
    if (!drawStart) return;
    const snapped = shiftKey ? snapToAxis(drawStart, imagePoint) : imagePoint;
    set({ drawCurrent: snapped });
  },

  finishDrawing: () => {
    const { drawStart, drawCurrent } = get();
    if (!drawStart || !drawCurrent) {
      set({ isDrawing: false, drawStart: null, drawCurrent: null });
      return null;
    }
    const dist = pixelDist(drawStart, drawCurrent);
    set({ isDrawing: false, drawStart: null, drawCurrent: null });
    if (dist <= 3) return null;
    return { start: drawStart, end: drawCurrent, pixelLength: dist };
  },

  cancelDrawing: () =>
    set({ isDrawing: false, drawStart: null, drawCurrent: null }),

  startPanning: (screenPoint) => {
    const { transform } = get();
    set({
      isPanning: true,
      panAnchor: {
        x: screenPoint.x - transform.panX,
        y: screenPoint.y - transform.panY,
      },
    });
  },

  updatePanning: (screenPoint) => {
    const { panAnchor, transform } = get();
    if (!panAnchor) return;
    set({
      transform: {
        ...transform,
        panX: screenPoint.x - panAnchor.x,
        panY: screenPoint.y - panAnchor.y,
      },
    });
  },

  stopPanning: () => set({ isPanning: false, panAnchor: null }),

  // Pinch-to-zoom
  startPinchZoom: (dist) => {
    const { transform } = get();
    set({ pinchStartDist: dist, pinchStartZoom: transform.zoom });
  },

  updatePinchZoom: (dist, centerX, centerY) => {
    const { pinchStartDist, pinchStartZoom, transform } = get();
    if (pinchStartDist === null || pinchStartZoom === null) return;
    const ratio = dist / pinchStartDist;
    const newZoom = Math.max(0.05, Math.min(pinchStartZoom * ratio, 50));
    set({
      transform: {
        panX: centerX - (centerX - transform.panX) * (newZoom / transform.zoom),
        panY: centerY - (centerY - transform.panY) * (newZoom / transform.zoom),
        zoom: newZoom,
      },
    });
  },

  stopPinchZoom: () => set({ pinchStartDist: null, pinchStartZoom: null }),

  // Zoom controls (zoom toward center of canvas)
  zoomIn: () => {
    const { transform } = get();
    const newZoom = Math.min(transform.zoom * 1.3, 50);
    set({ transform: { ...transform, zoom: newZoom } });
  },
  zoomOut: () => {
    const { transform } = get();
    const newZoom = Math.max(transform.zoom / 1.3, 0.05);
    set({ transform: { ...transform, zoom: newZoom } });
  },

  // Angle drawing
  startAngle: () => set({ angleStep: 'vertex', angleVertex: null, angleArmA: null }),

  placeAnglePoint: (pt) => {
    const { angleStep, angleVertex, angleArmA } = get();
    if (angleStep === 'vertex') {
      set({ angleVertex: pt, angleStep: 'armA' });
      return null;
    }
    if (angleStep === 'armA') {
      set({ angleArmA: pt, angleStep: 'armB' });
      return null;
    }
    if (angleStep === 'armB' && angleVertex && angleArmA) {
      const angleDeg = calcAngleDeg(angleVertex, angleArmA, pt);
      const result: AngleMeasurement = {
        id: crypto.randomUUID(),
        type: 'angle',
        vertex: angleVertex,
        armA: angleArmA,
        armB: pt,
        angleDeg,
        name: '',
        createdAt: Date.now(),
      };
      set({ angleStep: null, angleVertex: null, angleArmA: null });
      return result;
    }
    return null;
  },

  cancelAngle: () => set({ angleStep: null, angleVertex: null, angleArmA: null }),

  // Area drawing
  addAreaPoint: (pt) => {
    set({ areaPoints: [...get().areaPoints, pt] });
  },
  finishArea: () => {
    const { areaPoints } = get();
    if (areaPoints.length < 3) {
      set({ areaPoints: [] });
      return null;
    }
    const pixelArea = calcPolygonArea(areaPoints);
    const result: AreaMeasurement = {
      id: crypto.randomUUID(),
      type: 'area',
      areaKind: 'polygon',
      points: [...areaPoints],
      pixelArea,
      name: '',
      createdAt: Date.now(),
    };
    set({ areaPoints: [] });
    return result;
  },
  cancelArea: () => set({ areaPoints: [] }),

  // Freehand drawing
  startFreehand: (pt) => set({ isFreehandDrawing: true, freehandPoints: [pt] }),
  addFreehandPoint: (pt) => {
    const { freehandPoints } = get();
    if (freehandPoints.length === 0) return;
    const last = freehandPoints[freehandPoints.length - 1];
    const dx = pt.x - last.x;
    const dy = pt.y - last.y;
    if (dx * dx + dy * dy < 9) return; // skip if < 3px movement
    set({ freehandPoints: [...freehandPoints, pt] });
  },
  finishFreehand: () => {
    const { freehandPoints } = get();
    set({ isFreehandDrawing: false, freehandPoints: [] });
    if (freehandPoints.length < 10) return null;
    const simplified = simplifyPath(freehandPoints, 2.0);
    const pixelArea = calcPolygonArea(simplified);
    return {
      id: crypto.randomUUID(),
      type: 'area',
      areaKind: 'freehand',
      points: simplified,
      pixelArea,
      name: '',
      createdAt: Date.now(),
    } as AreaMeasurement;
  },
  cancelFreehand: () => set({ isFreehandDrawing: false, freehandPoints: [] }),

  // Circle-3-point drawing
  addCircle3PtPoint: (pt) => {
    const { circle3PtPoints } = get();
    if (circle3PtPoints.length < 3) {
      set({ circle3PtPoints: [...circle3PtPoints, pt] });
    }
  },
  finishCircle3Pt: () => {
    const { circle3PtPoints } = get();
    set({ circle3PtPoints: [] });
    if (circle3PtPoints.length !== 3) return null;
    const result = circumscribedCircle(circle3PtPoints[0], circle3PtPoints[1], circle3PtPoints[2]);
    if (!result) return null; // collinear
    return {
      id: crypto.randomUUID(),
      type: 'area',
      areaKind: 'circle-3pt',
      points: [...circle3PtPoints],
      pixelArea: circleArea(result.radius),
      center: result.center,
      radius: result.radius,
      name: '',
      createdAt: Date.now(),
    } as AreaMeasurement;
  },
  cancelCircle3Pt: () => set({ circle3PtPoints: [] }),

  // Circle-center drawing
  startCircleCenter: (center) => set({ circleCenterPoint: center }),
  finishCircleCenter: (edgePt) => {
    const { circleCenterPoint } = get();
    set({ circleCenterPoint: null });
    if (!circleCenterPoint) return null;
    const radius = pixelDist(circleCenterPoint, edgePt);
    if (radius < 3) return null;
    return {
      id: crypto.randomUUID(),
      type: 'area',
      areaKind: 'circle-center',
      points: [circleCenterPoint, edgePt],
      pixelArea: circleArea(radius),
      center: circleCenterPoint,
      radius,
      name: '',
      createdAt: Date.now(),
    } as AreaMeasurement;
  },
  cancelCircleCenter: () => set({ circleCenterPoint: null }),

  // 3D drawing actions
  startDrawing3D: (point) => set({ isDrawing3D: true, draw3DStart: point, draw3DCurrent: point }),
  updateDrawing3D: (point) => set({ draw3DCurrent: point }),
  finishDrawing3D: () => {
    const { draw3DStart, draw3DCurrent } = get();
    if (!draw3DStart || !draw3DCurrent) {
      set({ isDrawing3D: false, draw3DStart: null, draw3DCurrent: null });
      return null;
    }
    const dx = draw3DCurrent.x - draw3DStart.x;
    const dy = draw3DCurrent.y - draw3DStart.y;
    const dz = draw3DCurrent.z - draw3DStart.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    set({ isDrawing3D: false, draw3DStart: null, draw3DCurrent: null });
    if (distance < 0.0001) return null;
    return { start: draw3DStart, end: draw3DCurrent, distance };
  },
  cancelDrawing3D: () => set({ isDrawing3D: false, draw3DStart: null, draw3DCurrent: null }),

  // Crop drawing
  startCropDraw: (pt) => set({ isCropping: true, cropStart: pt, cropCurrent: pt }),
  updateCropDraw: (pt) => set({ cropCurrent: pt }),
  finishCropDraw: () => {
    const { cropStart, cropCurrent } = get();
    const image = useSceneObjectStore.getState().getActiveImage();
    set({ isCropping: false, cropStart: null, cropCurrent: null });
    if (!cropStart || !cropCurrent || !image) return null;

    const x = Math.max(0, Math.min(cropStart.x, cropCurrent.x));
    const y = Math.max(0, Math.min(cropStart.y, cropCurrent.y));
    const x2 = Math.min(image.width, Math.max(cropStart.x, cropCurrent.x));
    const y2 = Math.min(image.height, Math.max(cropStart.y, cropCurrent.y));
    const w = x2 - x;
    const h = y2 - y;

    if (w < 10 || h < 10) return null;
    return { x, y, w, h };
  },
  cancelCropDraw: () => set({ isCropping: false, cropStart: null, cropCurrent: null }),
  applyCrop: (bounds) => {
    const sceneStore = useSceneObjectStore.getState();
    const activeObj = sceneStore.getActiveObject();
    const image = activeObj?.type === 'image' ? activeObj.image : null;
    if (!image || !activeObj) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bounds.w;
    tempCanvas.height = bounds.h;
    const ctx = tempCanvas.getContext('2d')!;
    ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);

    const dataUrl = tempCanvas.toDataURL('image/png');
    const newImg = new window.Image();
    newImg.onload = () => {
      if (useSceneObjectStore.getState().objects.find(o => o.id === activeObj.id)?.image !== image) return;
      sceneStore.updateObject(activeObj.id, { image: newImg, imageDataUrl: dataUrl });
      useMeasurementStore.getState().adjustAllCoordinates(-bounds.x, -bounds.y, activeObj.id);
    };
    newImg.src = dataUrl;
  },
  reset: () => {
    set({
      transform: { panX: 0, panY: 0, zoom: 1 },
      isDrawing: false,
      drawStart: null,
      drawCurrent: null,
      isPanning: false,
      panAnchor: null,
      pinchStartDist: null,
      pinchStartZoom: null,
      snapPoint: null,
      angleStep: null,
      angleVertex: null,
      angleArmA: null,
      areaPoints: [],
      freehandPoints: [],
      isFreehandDrawing: false,
      circle3PtPoints: [],
      circleCenterPoint: null,
      isDrawing3D: false,
      draw3DStart: null,
      draw3DCurrent: null,
      cropStart: null,
      cropCurrent: null,
      isCropping: false,
    });
  },
}));
