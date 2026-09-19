'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { initializeDocumentHistory, undoDocument, redoDocument } from '@/lib/document-history';
import { useProjectStore } from '@/stores/useProjectStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    initializeDocumentHistory();
    const cancelTools = () => {
      const c = useCanvasStore.getState();
      c.cancelDrawing(); c.cancelDrawing3D(); c.cancelAngle(); c.cancelArea();
      c.cancelFreehand(); c.cancelCircle3Pt(); c.cancelCircleCenter(); c.setSnapPoint(null);
    };
    const stopModes = useUIStore.subscribe((state, previous) => {
      if (state.mode !== previous.mode || state.cropMode !== previous.cropMode) cancelTools();
    });
    const stopSources = useSceneObjectStore.subscribe((state, previous) => {
      if (state.activeObjectId !== previous.activeObjectId) cancelTools();
    });
    const handler = (e: KeyboardEvent) => {
      if (useProjectStore.getState().busy) return;
      // Skip when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const { toggleMode, selectMeasurement, selectedMeasurementId } =
        useUIStore.getState();
      const { removeMeasurement } = useMeasurementStore.getState();
      const { cancelDrawing, isDrawing, cancelAngle, angleStep, cancelArea, areaPoints, cancelCropDraw, cancelFreehand, isFreehandDrawing, cancelCircle3Pt, circle3PtPoints, cancelCircleCenter, circleCenterPoint } = useCanvasStore.getState();

      switch (e.key.toLowerCase()) {
        case 'r':
          if (!e.ctrlKey && !e.metaKey) toggleMode('reference');
          break;
        case 'm':
          if (!e.ctrlKey && !e.metaKey) {
            const lastMeasureTool = useUIStore.getState().lastMeasureTool;
            toggleMode(lastMeasureTool || 'measure');
          }
          break;
        case 'a':
          if (!e.ctrlKey && !e.metaKey) toggleMode('angle');
          break;
        case 'p':
          if (!e.ctrlKey && !e.metaKey) {
            const lastAreaTool = useUIStore.getState().lastAreaTool;
            toggleMode(lastAreaTool || 'area-polygon');
          }
          break;
        case 't':
          if (!e.ctrlKey && !e.metaKey) toggleMode('annotation');
          break;
        case 'c':
          if (!e.ctrlKey && !e.metaKey) {
            const ui = useUIStore.getState();
            ui.setCropMode(!ui.cropMode);
          }
          break;
        case 'g':
          if (!e.ctrlKey && !e.metaKey) {
            useUIStore.getState().toggleGrid();
          }
          break;
        case 'escape':
          if (useCanvasStore.getState().isDrawing3D) { useCanvasStore.getState().cancelDrawing3D(); break; }
          if (useUIStore.getState().cropMode) {
            cancelCropDraw();
            useUIStore.getState().cancelCrop();
          } else if (useUIStore.getState().annotationEditorOpen) {
            useUIStore.getState().closeAnnotationEditor();
          } else if (isDrawing) {
            cancelDrawing();
          } else if (angleStep) {
            cancelAngle();
          } else if (areaPoints.length > 0) {
            cancelArea();
          } else if (isFreehandDrawing) {
            cancelFreehand();
          } else if (circle3PtPoints.length > 0) {
            cancelCircle3Pt();
          } else if (circleCenterPoint) {
            cancelCircleCenter();
          } else {
            useUIStore.getState().setMode('none');
            selectMeasurement(null);
          }
          break;
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redoDocument();
            } else {
              undoDocument();
            }
          }
          break;
        case 'delete':
        case 'backspace':
          if (selectedMeasurementId) {
            const m = useMeasurementStore.getState().measurements.find(x => x.id === selectedMeasurementId);
            if (m && !m.locked) {
              removeMeasurement(selectedMeasurementId);
              selectMeasurement(null);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); stopModes(); stopSources(); };
  }, []);
}
