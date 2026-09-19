'use client';

import { useCallback, useRef, useEffect } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { useUIStore } from '@/stores/useUIStore';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { snapToAxis, snapToGrid, pixelDist, getAllEndpoints } from '@/lib/geometry';
import { Point, Annotation, Measurement, AnyMeasurement } from '@/types/measurement';
import { beginDocumentEdit, endDocumentEdit } from '@/lib/document-history';
import { hitSourceId, localPoint, sourceMatrix } from '@/lib/source-coordinates';

/**
 * Find nearest snap point in image space.
 * screenThreshold is in screen pixels; converted to image units via zoom.
 */
function findSnapWorld(
  imgPt: Point,
  measurements: AnyMeasurement[],
  zoom: number,
  screenThreshold = 12,
  excludeId?: string,
): Point | null {
  const threshold = screenThreshold / zoom;
  const filtered = excludeId ? measurements.filter((m) => m.id !== excludeId) : measurements;
  const endpoints = getAllEndpoints(filtered);

  let nearest: Point | null = null;
  let nearestDist = Infinity;

  for (const ep of endpoints) {
    const d = pixelDist(imgPt, ep);
    if (d < threshold && d < nearestDist) {
      nearestDist = d;
      nearest = ep;
    }
  }
  return nearest;
}

/**
 * R3F-based interaction hook for the image plane.
 * Replaces useCanvasInteraction with ThreeEvent handlers + DOM drag tracking.
 *
 * Returns onPointerDown, onPointerMove, onDoubleClick to attach to ImagePlane.
 */
export function useSceneInteraction() {
  const { camera, gl } = useThree();

  // Keep mutable refs so DOM handlers always see latest values
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const glRef = useRef(gl);
  glRef.current = gl;

  // Drag state refs
  const endpointDrag = useRef<{
    measurementId: string;
    endpoint: 'start' | 'end';
    origPoint: Point;
    otherPoint: Point;
    startImgPt: Point;
  } | null>(null);

  const arrowTargetDrag = useRef<{
    annotationId: string;
    origTarget: Point;
    startImgPt: Point;
  } | null>(null);

  // Store DOM handlers so we can remove them later
  const domHandlers = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);

  // ---- Helpers ----

  /** Convert a DOM PointerEvent to image-space point via camera unprojection */
  function domEventToImage(e: PointerEvent): Point {
    const cam = cameraRef.current;
    const renderer = glRef.current;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const source = useSceneObjectStore.getState().getActiveObject();
    const matrix = source ? sourceMatrix(source.transform) : new THREE.Matrix4();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0).applyMatrix4(matrix);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    const world = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!world) return { x: 0, y: 0 };
    const p = localPoint(world, source);
    return { x: p.x, y: -p.y };
  }

  function getZoom(): number {
    return (cameraRef.current as THREE.OrthographicCamera).zoom || 1;
  }

  /** Get image point with snap-to-point and grid snap applied */
  function getSnappedPoint(imgPt: Point, excludeId?: string): Point {
    const z = getZoom();
    const measurements = activeMeasurements();

    // Priority 1: snap to existing endpoints
    const snap = findSnapWorld(imgPt, measurements, z, 12, excludeId);
    if (snap) {
      useCanvasStore.getState().setSnapPoint(snap);
      return snap;
    }

    // Priority 2: snap to grid
    const { gridEnabled, gridSpacing } = useUIStore.getState();
    if (gridEnabled) {
      const gridPt = snapToGrid(imgPt, gridSpacing);
      if (pixelDist(imgPt, gridPt) < 12 / z) {
        useCanvasStore.getState().setSnapPoint(gridPt);
        return gridPt;
      }
    }

    useCanvasStore.getState().setSnapPoint(null);
    return imgPt;
  }

  /** Snap with support for grid/endpoints (for drag operations) */
  function snapDragPoint(point: Point, z: number, excludeId?: string): { snapped: Point; didSnap: boolean } {
    const measurements = activeMeasurements();
    const snap = findSnapWorld(point, measurements, z, 12, excludeId);
    if (snap) return { snapped: snap, didSnap: true };

    const { gridEnabled, gridSpacing } = useUIStore.getState();
    if (gridEnabled) {
      const gridPt = snapToGrid(point, gridSpacing);
      if (pixelDist(point, gridPt) < 12 / z) {
        return { snapped: gridPt, didSnap: true };
      }
    }
    return { snapped: point, didSnap: false };
  }

  // ---- DOM drag tracking ----

  function stopDomTracking() {
    if (domHandlers.current) {
      window.removeEventListener('pointermove', domHandlers.current.move);
      window.removeEventListener('pointerup', domHandlers.current.up);
      domHandlers.current = null;
      endDocumentEdit();
    }
  }

  function startDomTracking() {
    stopDomTracking();
    beginDocumentEdit();

    const onMove = (e: PointerEvent) => {
      const imgPt = domEventToImage(e);
      const state = useCanvasStore.getState();
      const z = getZoom();

      // Endpoint drag
      if (endpointDrag.current) {
        const drag = endpointDrag.current;
        const dx = imgPt.x - drag.startImgPt.x;
        const dy = imgPt.y - drag.startImgPt.y;
        let newPoint = { x: drag.origPoint.x + dx, y: drag.origPoint.y + dy };

        const { snapped, didSnap } = snapDragPoint(newPoint, z, drag.measurementId);
        newPoint = snapped;
        state.setSnapPoint(didSnap ? snapped : null);

        const other = drag.otherPoint;
        const pixelLength = Math.sqrt((newPoint.x - other.x) ** 2 + (newPoint.y - other.y) ** 2);
        useMeasurementStore.getState().updateMeasurement(drag.measurementId, {
          [drag.endpoint]: newPoint,
          pixelLength,
        });
        return;
      }

      // Arrow target drag
      if (arrowTargetDrag.current) {
        const drag = arrowTargetDrag.current;
        const dx = imgPt.x - drag.startImgPt.x;
        const dy = imgPt.y - drag.startImgPt.y;
        let newTarget = { x: drag.origTarget.x + dx, y: drag.origTarget.y + dy };

        const { snapped, didSnap } = snapDragPoint(newTarget, z, drag.annotationId);
        newTarget = snapped;
        state.setSnapPoint(didSnap ? snapped : null);

        useMeasurementStore.getState().updateMeasurement(drag.annotationId, { arrowTarget: newTarget });
        return;
      }

      // In-progress line drawing (reference/measure)
      if (state.isDrawing) {
        const snapped = getSnappedPoint(imgPt);
        const final = e.shiftKey && state.drawStart ? snapToAxis(state.drawStart, snapped) : snapped;
        useCanvasStore.setState({ drawCurrent: final });
        return;
      }

      // Freehand capture
      if (state.isFreehandDrawing) {
        state.addFreehandPoint(imgPt);
        return;
      }

      // Crop drawing
      if (state.isCropping) {
        state.updateCropDraw(imgPt);
        return;
      }
    };

    const onUp = (_e: PointerEvent) => {
      const state = useCanvasStore.getState();

      // Endpoint drag release
      if (endpointDrag.current) {
        endpointDrag.current = null;
        state.setSnapPoint(null);
        stopDomTracking();
        return;
      }

      // Arrow target drag release
      if (arrowTargetDrag.current) {
        arrowTargetDrag.current = null;
        state.setSnapPoint(null);
        stopDomTracking();
        return;
      }

      // Crop finish
      if (state.isCropping) {
        const bounds = state.finishCropDraw();
        if (bounds) useUIStore.getState().setCropBounds(bounds);
        stopDomTracking();
        return;
      }

      // Freehand finish
      if (state.isFreehandDrawing) {
        const result = useCanvasStore.getState().finishFreehand();
        if (result) {
          const mStore = useMeasurementStore.getState();
          const activeId = useSceneObjectStore.getState().activeObjectId;
          result.name = `Area ${mStore.getAreaCount(activeId ?? undefined) + 1}`;
          if (activeId) result.surfaceId = activeId;
          mStore.addArea(result);
        }
        stopDomTracking();
        return;
      }

      // Line drawing finish (reference/measure)
      if (state.isDrawing) {
        const result = state.finishDrawing();
        if (result) {
          const mode = useUIStore.getState().mode;
          const mStore = useMeasurementStore.getState();
          const activeId = useSceneObjectStore.getState().activeObjectId;
          const name =
            mode === 'reference'
              ? 'Reference'
              : `Measurement ${mStore.getMeasureCount('image', activeId ?? undefined) + 1}`;
          mStore.addMeasurement({
            id: crypto.randomUUID(),
            type: mode as 'reference' | 'measure',
            start: result.start,
            end: result.end,
            pixelLength: result.pixelLength,
            name,
            createdAt: Date.now(),
            surfaceId: activeId ?? undefined,
          });
        }
        stopDomTracking();
        return;
      }

      stopDomTracking();
    };

    domHandlers.current = { move: onMove, up: onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Clean up DOM listeners on unmount
  useEffect(() => {
    return () => stopDomTracking();
  }, []);

  // ---- ThreeEvent handlers for ImagePlane ----

  function activeMeasurements() {
    const id = useSceneObjectStore.getState().activeObjectId;
    return useMeasurementStore.getState().measurements.filter(m => m.visible !== false && (m.surfaceId === id || (!m.surfaceId && useSceneObjectStore.getState().getImages().length === 1)));
  }
  function eventPoint(e: ThreeEvent<PointerEvent>, select = false): Point | null {
    const id = hitSourceId(e.object);
    const scene = useSceneObjectStore.getState();
    if (!select && id !== scene.activeObjectId) return null;
    const source = scene.objects.find(o => o.id === id);
    if (select && id) scene.setActiveObject(id);
    const p = localPoint(e.point, source);
    return { x: p.x, y: -p.y };
  }

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return;
      const imgPt = eventPoint(e, true);
      if (!imgPt) return;
      const mode = useUIStore.getState().mode;
      const z = (cameraRef.current as THREE.OrthographicCamera).zoom || 1;
      const threshold = 12 / z;
      const endpointThreshold = 20 / z;

      // Crop mode
      if (useUIStore.getState().cropMode && e.button === 0) {
        e.stopPropagation();
        useCanvasStore.getState().startCropDraw(imgPt);
        startDomTracking();
        return;
      }

      // Arrow draw mode: place arrowTarget for annotation
      const arrowAnnotationId = useUIStore.getState().arrowDrawAnnotationId;
      if (e.button === 0 && arrowAnnotationId) {
        e.stopPropagation();
        const snapped = getSnappedPoint(imgPt);
        useMeasurementStore.getState().updateMeasurement(arrowAnnotationId, { arrowTarget: snapped });
        useUIStore.getState().cancelArrowDraw();
        return;
      }

      // Navigate mode: check for endpoint / arrow-target drag
      if (e.button === 0 && mode === 'none') {
        // Arrow targets
        const annotations = activeMeasurements().filter(
          (m): m is Annotation => m.type === 'annotation' && !!m.arrowTarget && !m.locked,
        );
        for (const ann of annotations) {
          if (pixelDist(imgPt, ann.arrowTarget!) < threshold) {
            e.stopPropagation();
            arrowTargetDrag.current = {
              annotationId: ann.id,
              origTarget: { ...ann.arrowTarget! },
              startImgPt: imgPt,
            };
            startDomTracking();
            return;
          }
        }

        // Measurement line endpoints
        const lines = activeMeasurements().filter(
          (m): m is Measurement => (m.type === 'reference' || m.type === 'measure') && m.surface !== 'model' && !m.locked && !m.combinedFrom,
        );
        for (const line of lines) {
          for (const ep of ['start', 'end'] as const) {
            if (pixelDist(imgPt, line[ep]) < endpointThreshold) {
              e.stopPropagation();
              endpointDrag.current = {
                measurementId: line.id,
                endpoint: ep,
                origPoint: { ...line[ep] },
                otherPoint: { ...(ep === 'start' ? line.end : line.start) },
                startImgPt: imgPt,
              };
              startDomTracking();
              return;
            }
          }
        }

        // Nothing interactive — let MapControls handle it
        return;
      }

      // ---- Drawing modes: stop propagation to prevent MapControls ----
      e.stopPropagation();

      // Annotation mode
      if (e.button === 0 && mode === 'annotation') {
        const snapped = getSnappedPoint(imgPt);
        useUIStore.getState().startAnnotationPlacement(snapped);
        return;
      }

      // Area polygon mode
      if (e.button === 0 && (mode === 'area' || mode === 'area-polygon')) {
        const snapped = getSnappedPoint(imgPt);
        const state = useCanvasStore.getState();

        // Close polygon if clicking near first point
        if (state.areaPoints.length >= 3) {
          if (pixelDist(snapped, state.areaPoints[0]) < threshold) {
            const result = state.finishArea();
            if (result) {
              const activeId = useSceneObjectStore.getState().activeObjectId;
              result.name = `Area ${useMeasurementStore.getState().getAreaCount(activeId ?? undefined) + 1}`;
              if (activeId) result.surfaceId = activeId;
              useMeasurementStore.getState().addArea(result);
            }
            return;
          }
        }
        state.addAreaPoint(snapped);
        return;
      }

      // Freehand mode
      if (e.button === 0 && mode === 'area-freehand') {
        const snapped = getSnappedPoint(imgPt);
        useCanvasStore.getState().startFreehand(snapped);
        startDomTracking();
        return;
      }

      // Circle 3-point mode
      if (e.button === 0 && mode === 'area-circle-3pt') {
        const snapped = getSnappedPoint(imgPt);
        const state = useCanvasStore.getState();
        state.addCircle3PtPoint(snapped);
        // After adding the 3rd point, finish
        if (state.circle3PtPoints.length >= 2) {
          const result = useCanvasStore.getState().finishCircle3Pt();
          if (result) {
            const activeId = useSceneObjectStore.getState().activeObjectId;
            result.name = `Area ${useMeasurementStore.getState().getAreaCount(activeId ?? undefined) + 1}`;
            if (activeId) result.surfaceId = activeId;
            useMeasurementStore.getState().addArea(result);
          }
        }
        return;
      }

      // Circle center mode
      if (e.button === 0 && mode === 'area-circle-center') {
        const snapped = getSnappedPoint(imgPt);
        const state = useCanvasStore.getState();
        if (!state.circleCenterPoint) {
          state.startCircleCenter(snapped);
        } else {
          const result = state.finishCircleCenter(snapped);
          if (result) {
            const activeId = useSceneObjectStore.getState().activeObjectId;
            result.name = `Area ${useMeasurementStore.getState().getAreaCount(activeId ?? undefined) + 1}`;
            if (activeId) result.surfaceId = activeId;
            useMeasurementStore.getState().addArea(result);
          }
        }
        return;
      }

      // Angle mode
      if (e.button === 0 && mode === 'angle') {
        const snapped = getSnappedPoint(imgPt);
        const state = useCanvasStore.getState();
        if (!state.angleStep) state.startAngle();
        const result = useCanvasStore.getState().placeAnglePoint(snapped);
        if (result) {
          const activeId = useSceneObjectStore.getState().activeObjectId;
          result.name = `Angle ${useMeasurementStore.getState().getAngleCount(activeId ?? undefined) + 1}`;
          if (activeId) result.surfaceId = activeId;
          useMeasurementStore.getState().addAngle(result);
          useCanvasStore.getState().startAngle();
        }
        return;
      }

      // Reference / Measure (single + chain) — click-click:
      // first click sets the start, second click finalises the segment.
      // In chain mode, finishing one segment immediately primes the next from
      // the just-placed point.
      if (e.button === 0 && (mode === 'reference' || mode === 'measure' || mode === 'measure-chain')) {
        const snapped = getSnappedPoint(imgPt);
        const state = useCanvasStore.getState();
        if (!state.isDrawing) {
          state.startDrawing(snapped);
        } else {
          state.updateDrawing(snapped, e.nativeEvent.shiftKey);
          const result = state.finishDrawing();
          if (result && pixelDist(result.start, result.end) > 0.5) {
            const mStore = useMeasurementStore.getState();
            const activeId = useSceneObjectStore.getState().activeObjectId;
            const name = mode === 'reference'
              ? 'Reference'
              : `Measurement ${mStore.getMeasureCount('image', activeId ?? undefined) + 1}`;
            mStore.addMeasurement({
              id: crypto.randomUUID(),
              type: mode === 'reference' ? 'reference' : 'measure',
              start: result.start,
              end: result.end,
              pixelLength: result.pixelLength,
              name,
              createdAt: Date.now(),
              surfaceId: activeId ?? undefined,
            });
          }
          // Continue chain from the just-placed point; single mode exits.
          if (mode === 'measure-chain') {
            state.startDrawing(result?.end ?? snapped);
          }
        }
        return;
      }
    },
    [], // stable: reads from refs and stores
  );

  /** Pointer move on the ImagePlane mesh — for snap feedback and draw previews */
  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const imgPt = eventPoint(e);
      if (!imgPt) return;
      const mode = useUIStore.getState().mode;
      const state = useCanvasStore.getState();

      // Update snap indicator for visual feedback during drawing modes
      if (mode !== 'none' || useUIStore.getState().arrowDrawAnnotationId) {
        getSnappedPoint(imgPt); // sets snapPoint in store as side effect
      } else if (state.snapPoint) {
        state.setSnapPoint(null);
      }

      // Update drawCurrent for multi-click draw previews
      // (Drag-based previews are handled by DOM move handler)
      if (state.angleStep) {
        useCanvasStore.setState({ drawCurrent: getSnappedPoint(imgPt) });
      }
      if ((mode === 'area' || mode === 'area-polygon') && state.areaPoints.length > 0) {
        useCanvasStore.setState({ drawCurrent: getSnappedPoint(imgPt) });
      }
      if (mode === 'area-circle-3pt' && state.circle3PtPoints.length > 0) {
        useCanvasStore.setState({ drawCurrent: getSnappedPoint(imgPt) });
      }
      if (mode === 'area-circle-center' && state.circleCenterPoint) {
        useCanvasStore.setState({ drawCurrent: getSnappedPoint(imgPt) });
      }

      // For in-progress line drawing when still over the mesh
      // (DOM handler takes over once registered, but handle the initial phase too)
      if (state.isDrawing && !domHandlers.current) {
        const snapped = getSnappedPoint(imgPt);
        const final = e.nativeEvent.shiftKey && state.drawStart
          ? snapToAxis(state.drawStart, snapped)
          : snapped;
        useCanvasStore.setState({ drawCurrent: final });
      }
    },
    [], // stable: reads from refs and stores
  );

  /** Double-click to close polygon */
  const onDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const mode = useUIStore.getState().mode;
      if (mode !== 'area' && mode !== 'area-polygon') return;
      const state = useCanvasStore.getState();
      if (state.areaPoints.length >= 3) {
        e.stopPropagation();
        const result = state.finishArea();
        if (result) {
          const activeId = useSceneObjectStore.getState().activeObjectId;
          result.name = `Area ${useMeasurementStore.getState().getAreaCount(activeId ?? undefined) + 1}`;
          if (activeId) result.surfaceId = activeId;
          useMeasurementStore.getState().addArea(result);
        }
      }
    },
    [],
  );

  return { onPointerDown, onPointerMove, onDoubleClick };
}
