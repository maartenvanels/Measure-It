'use client';

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { Canvas, useThree, ThreeEvent } from '@react-three/fiber';
import { Html, Line, Bvh, GizmoHelper, GizmoViewcube, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { useUIStore } from '@/stores/useUIStore';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { Point, Point3D, Measurement, AngleMeasurement as AngleMeasurementType, AreaMeasurement as AreaMeasurementType, Annotation, AnyMeasurement } from '@/types/measurement';
import { DEFAULT_COLORS } from '@/lib/canvas-rendering';
import { calcRealDistance, calcRealArea } from '@/lib/calculations';
import { SceneControls, useImageCamera } from './SceneControls';
import { SceneObjectRenderer } from './SceneObjectRenderer';
import { SourceTransform } from './SourceTransform';
import { hitSourceId, localPoint, sourceMatrix } from '@/lib/source-coordinates';
import { beginDocumentEdit, endDocumentEdit } from '@/lib/document-history';
import { MeasurementLineComponent } from './measurements/MeasurementLine';
import { AngleMeasurementComponent } from './measurements/AngleMeasurement';
import { AreaMeasurementComponent } from './measurements/AreaMeasurement';
import { AnnotationMarkerComponent } from './measurements/AnnotationMarker';
import { SnapIndicator } from './measurements/SnapIndicator';
import { ImageGrid } from './measurements/ImageGrid';
import { DrawPreviewLine, DrawPreviewAngle, DrawPreviewArea, DrawPreviewFreehand, DrawPreviewCircle3Pt, DrawPreviewCircleCenter } from './measurements/DrawPreview';
import { useSceneInteraction } from '@/hooks/useSceneInteraction';
import { TransformGizmo } from './TransformGizmo';

// ---- 3D Measurement helper components ----

function MeasurementPoint({ position, color, scale = 0.02 }: { position: Point3D; color: string; scale?: number }) {
  return (
    <mesh position={[position.x, position.y, position.z]}>
      <sphereGeometry args={[scale, 16, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function OriginAxes({ size }: { size: number }) {
  return (
    <group>
      <Line points={[[0, 0, 0], [size, 0, 0]]} color="#ef4444" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, size, 0]]} color="#22c55e" lineWidth={2} />
      <Line points={[[0, 0, 0], [0, 0, size]]} color="#3b82f6" lineWidth={2} />
      <Html position={[size * 1.12, 0, 0]} center style={{ pointerEvents: 'none' }}>
        <span className="text-[10px] font-bold text-red-400">X</span>
      </Html>
      <Html position={[0, size * 1.12, 0]} center style={{ pointerEvents: 'none' }}>
        <span className="text-[10px] font-bold text-green-400">Y</span>
      </Html>
      <Html position={[0, 0, size * 1.12]} center style={{ pointerEvents: 'none' }}>
        <span className="text-[10px] font-bold text-blue-400">Z</span>
      </Html>
    </group>
  );
}

function CartesianLines({ start, end, dashSize, gapSize }: {
  start: Point3D; end: Point3D; dashSize: number; gapSize: number;
}) {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const dz = Math.abs(end.z - start.z);
  const p0: [number, number, number] = [start.x, start.y, start.z];
  const p1: [number, number, number] = [end.x, start.y, start.z];
  const p2: [number, number, number] = [end.x, end.y, start.z];
  const p3: [number, number, number] = [end.x, end.y, end.z];
  const midX: [number, number, number] = [(start.x + end.x) / 2, start.y, start.z];
  const midY: [number, number, number] = [end.x, (start.y + end.y) / 2, start.z];
  const midZ: [number, number, number] = [end.x, end.y, (start.z + end.z) / 2];

  return (
    <group>
      {dx > 0.0001 && (
        <>
          <Line points={[p0, p1]} color="#ef4444" lineWidth={1} dashed dashSize={dashSize} gapSize={gapSize} />
          <Html position={midX} center style={{ pointerEvents: 'none' }}>
            <span className="text-[9px] text-red-400 font-mono bg-black/70 px-1 rounded">{dx.toFixed(2)}</span>
          </Html>
        </>
      )}
      {dy > 0.0001 && (
        <>
          <Line points={[p1, p2]} color="#22c55e" lineWidth={1} dashed dashSize={dashSize} gapSize={gapSize} />
          <Html position={midY} center style={{ pointerEvents: 'none' }}>
            <span className="text-[9px] text-green-400 font-mono bg-black/70 px-1 rounded">{dy.toFixed(2)}</span>
          </Html>
        </>
      )}
      {dz > 0.0001 && (
        <>
          <Line points={[p2, p3]} color="#3b82f6" lineWidth={1} dashed dashSize={dashSize} gapSize={gapSize} />
          <Html position={midZ} center style={{ pointerEvents: 'none' }}>
            <span className="text-[9px] text-blue-400 font-mono bg-black/70 px-1 rounded">{dz.toFixed(2)}</span>
          </Html>
        </>
      )}
    </group>
  );
}

function DraggableLabel({ measurementId, position, offset, labelType, children, style }: {
  measurementId: string;
  position: [number, number, number];
  offset?: Point;
  labelType: 'value' | 'name';
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const dragRef = useRef<{ startX: number; startY: number; origOffset: Point } | null>(null);
  const updateMeasurement = useMeasurementStore((s) => s.updateMeasurement);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    beginDocumentEdit();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origOffset: offset ?? { x: 0, y: 0 },
    };
  }, [offset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newOffset = { x: dragRef.current.origOffset.x + dx, y: dragRef.current.origOffset.y + dy };
    const field = labelType === 'value' ? 'labelOffset' : 'nameLabelOffset';
    updateMeasurement(measurementId, { [field]: newOffset });
  }, [measurementId, labelType, updateMeasurement]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    endDocumentEdit();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;

  return (
    <Html position={position} center style={{ pointerEvents: 'auto' }}>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          transform: `translate(${ox}px, ${oy}px)`,
          cursor: 'grab',
          userSelect: 'none',
          ...style,
        }}
      >
        {children}
      </div>
    </Html>
  );
}

function MeasurementLine3D({ measurement, label, selected, markerSize, showAxis, dashSize, gapSize }: {
  measurement: Measurement;
  label: string;
  selected: boolean;
  markerSize: number;
  showAxis: boolean;
  dashSize: number;
  gapSize: number;
}) {
  const color = measurement.color ?? DEFAULT_COLORS[measurement.type] ?? '#06b6d4';
  const s = measurement.start3D!;
  const e = measurement.end3D!;
  const midpoint: [number, number, number] = [
    (s.x + e.x) / 2,
    (s.y + e.y) / 2,
    (s.z + e.z) / 2,
  ];

  return (
    <group>
      <Line
        points={[
          [s.x, s.y, s.z],
          [e.x, e.y, e.z],
        ]}
        color={color}
        lineWidth={selected ? 3 : 2}
      />
      <MeasurementPoint position={s} color={color} scale={markerSize} />
      <MeasurementPoint position={e} color={color} scale={markerSize} />
      <DraggableLabel measurementId={measurement.id} position={midpoint} offset={measurement.labelOffset} labelType="value">
        <div
          className="rounded px-2 py-0.5 text-xs font-mono whitespace-nowrap"
          style={{
            backgroundColor: 'rgba(0,0,0,0.85)',
            color: color,
            border: selected ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.2)',
          }}
        >
          {label}
        </div>
      </DraggableLabel>
      {measurement.name && (
        <DraggableLabel
          measurementId={measurement.id}
          position={midpoint}
          offset={measurement.nameLabelOffset ?? { x: 0, y: 24 }}
          labelType="name"
        >
          <div
            className="rounded px-1.5 py-0.5 text-[11px] font-mono whitespace-nowrap"
            style={{
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: '#a1a1aa',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {measurement.name}
          </div>
        </DraggableLabel>
      )}
      {showAxis && <CartesianLines start={s} end={e} dashSize={dashSize} gapSize={gapSize} />}
    </group>
  );
}

function DrawPreview3D({ start, current, markerSize, dashSize, gapSize, showAxis }: {
  start: Point3D; current: Point3D; markerSize: number; dashSize: number; gapSize: number; showAxis: boolean;
}) {
  const midpoint: [number, number, number] = [
    (start.x + current.x) / 2,
    (start.y + current.y) / 2,
    (start.z + current.z) / 2,
  ];
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const dz = current.z - start.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return (
    <group>
      <Line
        points={[[start.x, start.y, start.z], [current.x, current.y, current.z]]}
        color="#ffffff"
        lineWidth={1.5}
        dashed
        dashSize={dashSize}
        gapSize={gapSize}
      />
      <MeasurementPoint position={start} color="#ffffff" scale={markerSize} />
      <MeasurementPoint position={current} color="#ffffff" scale={markerSize} />
      <Html position={midpoint} center style={{ pointerEvents: 'none' }}>
        <div className="rounded px-2 py-0.5 text-xs font-mono whitespace-nowrap bg-black/80 text-white border border-white/20">
          {dist.toFixed(4)}
        </div>
      </Html>
      {showAxis && <CartesianLines start={start} end={current} dashSize={dashSize} gapSize={gapSize} />}
    </group>
  );
}

function HoverIndicator({ point, scale = 0.03, snapped = false }: { point: Point3D; scale?: number; snapped?: boolean }) {
  return (
    <mesh position={[point.x, point.y, point.z]}>
      <sphereGeometry args={[scale, 16, 16]} />
      <meshBasicMaterial color={snapped ? '#facc15' : '#00ffff'} transparent opacity={0.8} />
    </mesh>
  );
}

function findSnap3D(
  mouseNDC: { x: number; y: number },
  modelMeasurements: Measurement[],
  camera: THREE.Camera,
  gl: THREE.WebGLRenderer,
  threshold = 16
): Point3D | null {
  const endpoints: Point3D[] = [];
  for (const m of modelMeasurements) {
    const source = useSceneObjectStore.getState().objects.find(o => o.id === m.surfaceId);
    const matrix = source ? sourceMatrix(source.transform) : new THREE.Matrix4();
    for (const p of [m.start3D, m.end3D]) {
      if (p) {
        const v = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(matrix);
        endpoints.push({ x: v.x, y: v.y, z: v.z });
      }
    }
  }
  if (endpoints.length === 0) return null;
  const canvasRect = gl.domElement.getBoundingClientRect();
  const mouseScreenX = ((mouseNDC.x + 1) / 2) * canvasRect.width;
  const mouseScreenY = ((1 - mouseNDC.y) / 2) * canvasRect.height;
  let nearest: Point3D | null = null;
  let nearestDist = Infinity;
  const v = new THREE.Vector3();
  for (const ep of endpoints) {
    v.set(ep.x, ep.y, ep.z);
    v.project(camera);
    const sx = ((v.x + 1) / 2) * canvasRect.width;
    const sy = ((1 - v.y) / 2) * canvasRect.height;
    const d = Math.sqrt((sx - mouseScreenX) ** 2 + (sy - mouseScreenY) ** 2);
    if (d < threshold && d < nearestDist) {
      nearestDist = d;
      nearest = ep;
    }
  }
  return nearest;
}

// ---- Image measurement layer (2D measurements + draw previews) ----

function ImageMeasurementLayer() {
  const objects = useSceneObjectStore(s => s.objects);
  const firstImage = useSceneObjectStore((s) => {
    const img = s.objects.find((o) => o.type === 'image' && o.visible);
    return img?.image ?? null;
  });
  const isDrawing = useCanvasStore((s) => s.isDrawing);
  const drawStart = useCanvasStore((s) => s.drawStart);
  const drawCurrent = useCanvasStore((s) => s.drawCurrent);
  const snapPoint = useCanvasStore((s) => s.snapPoint);
  const angleStep = useCanvasStore((s) => s.angleStep);
  const angleVertex = useCanvasStore((s) => s.angleVertex);
  const angleArmA = useCanvasStore((s) => s.angleArmA);
  const areaPoints = useCanvasStore((s) => s.areaPoints);
  const freehandPoints = useCanvasStore((s) => s.freehandPoints);
  const isFreehandDrawing = useCanvasStore((s) => s.isFreehandDrawing);
  const circle3PtPoints = useCanvasStore((s) => s.circle3PtPoints);
  const circleCenterPoint = useCanvasStore((s) => s.circleCenterPoint);

  const mode = useUIStore((s) => s.mode);
  const selectedId = useUIStore((s) => s.selectedMeasurementId);
  const selectMeasurement = useUIStore((s) => s.selectMeasurement);
  const gridEnabled = useUIStore((s) => s.gridEnabled);
  const gridSpacing = useUIStore((s) => s.gridSpacing);
  const openAnnotationEditor = useUIStore((s) => s.openAnnotationEditor);

  const measurements = useMeasurementStore((s) => s.measurements);
  const globalRefValue = useMeasurementStore((s) => s.referenceValue);
  const globalRefUnit = useMeasurementStore((s) => s.referenceUnit);
  const getReference = useMeasurementStore((s) => s.getReference);

  // Per-object reference: resolve from scene object when surfaceId is present
  const getRefForMeasurement = useCallback((m: AnyMeasurement) => {
    const obj = objects.find(o => o.id === m.surfaceId);
    const refValue = obj?.referenceValue ?? globalRefValue;
    const refUnit = obj?.referenceUnit ?? globalRefUnit;
    const ref = getReference('image', m.surfaceId);
    return { ref, refValue, refUnit };
  }, [getReference, globalRefValue, globalRefUnit, objects]);

  const getLabel = useCallback((m: AnyMeasurement): string => {
    const { ref, refValue, refUnit } = getRefForMeasurement(m);
    if (m.type === 'reference') {
      return refValue > 0 ? `${refValue} ${refUnit} (ref)` : `${(m as Measurement).pixelLength.toFixed(1)} px`;
    }
    if (m.type === 'measure') {
      const result = calcRealDistance((m as Measurement).pixelLength, ref, refValue, refUnit, (m as Measurement).unitOverride);
      return result ?? `${(m as Measurement).pixelLength.toFixed(1)} px`;
    }
    if (m.type === 'area') {
      const area = m as AreaMeasurementType;
      const result = calcRealArea(area.pixelArea, ref, refValue, refUnit, area.unitOverride);
      return result ?? `${area.pixelArea.toFixed(1)} px²`;
    }
    return '';
  }, [getRefForMeasurement]);

  // In-progress label uses the active object's reference
  const activeObjectId = useSceneObjectStore((s) => s.activeObjectId);
  const activeObject = useSceneObjectStore((s) =>
    s.activeObjectId ? s.objects.find((o) => o.id === s.activeObjectId) : undefined
  );
  const activeRefValue = activeObject?.referenceValue ?? globalRefValue;
  const activeRefUnit = activeObject?.referenceUnit ?? globalRefUnit;

  const inProgressLabel = useMemo(() => {
    if (!isDrawing || !drawStart || !drawCurrent) return '';
    const dx = drawCurrent.x - drawStart.x;
    const dy = drawCurrent.y - drawStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ref = getReference('image', activeObjectId ?? undefined);
    if (ref && activeRefValue > 0) {
      const ratio = activeRefValue / ref.pixelLength;
      return `${(dist * ratio).toFixed(2)} ${activeRefUnit}`;
    }
    return `${dist.toFixed(1)} px`;
  }, [isDrawing, drawStart, drawCurrent, getReference, activeObjectId, activeRefValue, activeRefUnit]);

  const measurements2D = useMemo(() =>
    measurements.filter(m => {
      if (m.visible === false) return false;
      if (m.type === 'reference' || m.type === 'measure') {
        const meas = m as Measurement;
        // Skip virtual combined totals — sidebar-only.
        if (meas.combinedFrom) return false;
        return (meas.surface ?? 'image') === 'image';
      }
      return true; // angles, areas, annotations are always image-space
    }),
    [measurements]
  );

  return (
    <>
      {/* Grid overlay */}
      {gridEnabled && firstImage && (
        <ImageGrid imageWidth={firstImage.width} imageHeight={firstImage.height} spacing={gridSpacing} />
      )}

      {/* Existing 2D measurements */}
      {measurements2D.map((m) => {
        const renderMeasurement = () => {
        if (m.type === 'reference' || m.type === 'measure') {
          return (
            <MeasurementLineComponent
              key={m.id}
              measurement={m as Measurement}
              label={getLabel(m)}
              selected={m.id === selectedId}
            />
          );
        }
        if (m.type === 'angle') {
          return (
            <AngleMeasurementComponent
              key={m.id}
              measurement={m as AngleMeasurementType}
              selected={m.id === selectedId}
            />
          );
        }
        if (m.type === 'area') {
          return (
            <AreaMeasurementComponent
              key={m.id}
              measurement={m as AreaMeasurementType}
              label={getLabel(m)}
              selected={m.id === selectedId}
            />
          );
        }
        if (m.type === 'annotation') {
          return (
            <AnnotationMarkerComponent
              key={m.id}
              annotation={m as Annotation}
              selected={m.id === selectedId}
              onSelect={() => selectMeasurement(m.id)}
              onDoubleClick={() => openAnnotationEditor(m.id)}
            />
          );
        }
        return null;
        };
        return <SourceTransform key={m.id} sourceId={m.surfaceId}>{renderMeasurement()}</SourceTransform>;
      })}

      <SourceTransform sourceId={activeObjectId ?? undefined}>
      {/* In-progress line drawing */}
      {isDrawing && drawStart && drawCurrent && (
        <DrawPreviewLine start={drawStart} end={drawCurrent} mode={mode} label={inProgressLabel} />
      )}

      {/* In-progress angle drawing */}
      {angleStep && (
        <DrawPreviewAngle vertex={angleVertex} armA={angleArmA} cursorPos={drawCurrent} />
      )}

      {/* In-progress polygon area */}
      {areaPoints.length > 0 && (mode === 'area' || mode === 'area-polygon') && (
        <DrawPreviewArea points={areaPoints} cursorPos={drawCurrent} />
      )}

      {/* In-progress freehand */}
      {isFreehandDrawing && freehandPoints.length > 0 && (
        <DrawPreviewFreehand points={freehandPoints} />
      )}

      {/* In-progress circle 3-point */}
      {circle3PtPoints.length > 0 && mode === 'area-circle-3pt' && (
        <DrawPreviewCircle3Pt placedPoints={circle3PtPoints} cursorPos={drawCurrent} />
      )}

      {/* In-progress circle center */}
      {circleCenterPoint && mode === 'area-circle-center' && (
        <DrawPreviewCircleCenter center={circleCenterPoint} cursorPos={drawCurrent} />
      )}

      {/* Snap indicator */}
      {snapPoint && <SnapIndicator point={snapPoint} />}
      </SourceTransform>
    </>
  );
}

// ---- Model measurement layer (3D measurements + draw previews) ----

function ModelMeasurementLayer({ modelScale }: { modelScale: number }) {
  const activeId = useSceneObjectStore(s => s.activeObjectId);
  const objects = useSceneObjectStore(s => s.objects);
  const draw3DStart = useCanvasStore((s) => s.draw3DStart);
  const draw3DCurrent = useCanvasStore((s) => s.draw3DCurrent);
  const isDrawing3D = useCanvasStore((s) => s.isDrawing3D);

  const selectedId = useUIStore((s) => s.selectedMeasurementId);
  const showAxisDistances = useUIStore((s) => s.show3DAxisDistances);

  const measurements = useMeasurementStore((s) => s.measurements);
  const globalRefValue = useMeasurementStore((s) => s.referenceValue);
  const globalRefUnit = useMeasurementStore((s) => s.referenceUnit);
  const getReference = useMeasurementStore((s) => s.getReference);

  const markerSize = modelScale * 0.005;
  const dashSize = modelScale * 0.02;
  const gapSize = modelScale * 0.012;

  const modelMeasurements = useMemo(
    () => measurements.filter((m): m is Measurement =>
      (m.type === 'reference' || m.type === 'measure') &&
      (m as Measurement).surface === 'model' &&
      m.visible !== false &&
      !(m as Measurement).combinedFrom
    ),
    [measurements]
  );

  const getLabel = useCallback(
    (m: Measurement) => {
      const obj = objects.find(o => o.id === m.surfaceId);
      const refValue = obj?.referenceValue ?? globalRefValue;
      const refUnit = obj?.referenceUnit ?? globalRefUnit;
      if (m.type === 'reference') {
        return refValue > 0 ? `${refValue} ${refUnit} (ref)` : (m.distance?.toFixed(4) ?? '');
      }
      const ref = getReference('model', m.surfaceId);
      const result = calcRealDistance(m.pixelLength, ref, refValue, refUnit, m.unitOverride);
      return result ?? (m.distance?.toFixed(4) ?? '');
    },
    [getReference, globalRefValue, globalRefUnit, objects]
  );

  return (
    <>
      {isDrawing3D && draw3DStart && draw3DCurrent && (
        <SourceTransform sourceId={activeId ?? undefined}>
        <DrawPreview3D
          start={draw3DStart}
          current={draw3DCurrent}
          markerSize={markerSize}
          dashSize={dashSize}
          gapSize={gapSize}
          showAxis={showAxisDistances}
        />
        </SourceTransform>
      )}

      {modelMeasurements.map((m) => (
        <SourceTransform key={m.id} sourceId={m.surfaceId}>
        <MeasurementLine3D
          key={m.id}
          measurement={m}
          label={getLabel(m)}
          selected={m.id === selectedId}
          markerSize={markerSize}
          showAxis={showAxisDistances}
          dashSize={dashSize}
          gapSize={gapSize}
        />
        </SourceTransform>
      ))}
    </>
  );
}

// ---- Unified scene content (rendered inside Canvas) ----

function UnifiedSceneContent() {
  // Scene objects from new store
  const objects = useSceneObjectStore((s) => s.objects);

  const isDrawing3D = useCanvasStore((s) => s.isDrawing3D);
  const startDrawing3D = useCanvasStore((s) => s.startDrawing3D);

  const mode = useUIStore((s) => s.mode);
  const selectedId = useUIStore((s) => s.selectedMeasurementId);
  const selectMeasurement = useUIStore((s) => s.selectMeasurement);

  const measurements = useMeasurementStore((s) => s.measurements);
  const addMeasurement = useMeasurementStore((s) => s.addMeasurement);
  const getMeasureCount = useMeasurementStore((s) => s.getMeasureCount);

  const { camera, gl } = useThree();

  // Detect scene composition
  const visibleObjects = useMemo(() => objects.filter((o) => o.visible), [objects]);
  const hasModels = visibleObjects.some((o) => o.type === 'model');
  const hasImages = visibleObjects.some((o) => o.type === 'image');
  const cameraMode = hasModels ? 'orbit' : 'ortho';
  const isMeasuring = mode !== 'none';

  // Model scale for marker sizing
  const [modelScale, setModelScale] = useState(1);
  const hoverSize = modelScale * 0.005 * 1.5;
  const axisSize = modelScale * 0.15;

  // Image camera fitting
  const { fitToImage } = useImageCamera();
  const firstVisibleImage = useSceneObjectStore((s) => {
    const img = s.objects.find((o) => o.type === 'image' && o.visible);
    return img?.image ?? null;
  });
  useEffect(() => {
    if (firstVisibleImage && !hasModels) {
      fitToImage(firstVisibleImage.width, firstVisibleImage.height);
    }
  }, [firstVisibleImage, hasModels, fitToImage]);

  // Image interaction handlers (for 2D drawing on image planes)
  const imageInteraction = useSceneInteraction();

  // ---- 3D model interaction ----
  const [hoverPoint, setHoverPoint] = useState<Point3D | null>(null);
  const [isSnapped, setIsSnapped] = useState(false);

  const modelMeasurements = useMemo(
    () => measurements.filter((m): m is Measurement =>
      (m.type === 'reference' || m.type === 'measure') &&
      (m as Measurement).surface === 'model' &&
      m.visible !== false &&
      !(m as Measurement).combinedFrom
    ),
    [measurements]
  );

  const trySnap3D = useCallback(
    (surfacePoint: Point3D, e: ThreeEvent<PointerEvent>): Point3D => {
      const canvasRect = gl.domElement.getBoundingClientRect();
      const mouseNDC = {
        x: ((e.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
        y: -((e.clientY - canvasRect.top) / canvasRect.height) * 2 + 1,
      };
      const snapped = findSnap3D(mouseNDC, modelMeasurements.filter(m => m.surfaceId === hitSourceId(e.object)), camera, gl);
      if (snapped) { setIsSnapped(true); return snapped; }
      setIsSnapped(false);
      return surfacePoint;
    },
    [modelMeasurements, camera, gl]
  );

  const handleModelPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const isMeasuring3D = mode === 'reference' || mode === 'measure';
      if (!isMeasuring3D || e.button !== 0) return;
      e.stopPropagation();
      const sourceId = hitSourceId(e.object);
      if (!sourceId) return;
      useSceneObjectStore.getState().setActiveObject(sourceId);
      const source = useSceneObjectStore.getState().getObject(sourceId);
      const surfacePoint: Point3D = { x: e.point.x, y: e.point.y, z: e.point.z };
      const local = localPoint(trySnap3D(surfacePoint, e), source);
      const point = { x: local.x, y: local.y, z: local.z };

      if (!useCanvasStore.getState().isDrawing3D) {
        startDrawing3D(point);
      } else {
        useCanvasStore.getState().updateDrawing3D(point);
        const { draw3DStart, draw3DCurrent } = useCanvasStore.getState();
        if (draw3DStart && draw3DCurrent) {
          const dx = draw3DCurrent.x - draw3DStart.x;
          const dy = draw3DCurrent.y - draw3DStart.y;
          const dz = draw3DCurrent.z - draw3DStart.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (distance >= 0.0001) {
            const type = mode as 'reference' | 'measure';
            const activeId = useSceneObjectStore.getState().activeObjectId;
            const name = type === 'reference' ? 'Reference 3D' : `3D Measurement ${getMeasureCount('model', activeId ?? undefined) + 1}`;
            const m: Measurement = {
              id: crypto.randomUUID(), type, name, createdAt: Date.now(),
              surface: 'model',
              surfaceId: activeId ?? undefined,
              start: { x: 0, y: 0 }, end: { x: 0, y: 0 },
              pixelLength: distance,
              start3D: draw3DStart, end3D: draw3DCurrent,
              distance,
            };
            addMeasurement(m);
          }
        }
        useCanvasStore.getState().cancelDrawing3D();
      }
    },
    [mode, isDrawing3D, startDrawing3D, addMeasurement, getMeasureCount, trySnap3D]
  );

  const handleModelPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const isMeasuring3D = mode === 'reference' || mode === 'measure';
      if (!isMeasuring3D) { setHoverPoint(null); setIsSnapped(false); return; }
      const surfacePoint: Point3D = { x: e.point.x, y: e.point.y, z: e.point.z };
      const point = trySnap3D(surfacePoint, e);
      setHoverPoint(point);
      if (isDrawing3D && hitSourceId(e.object) === useSceneObjectStore.getState().activeObjectId) {
        const local = localPoint(point, useSceneObjectStore.getState().getActiveObject());
        useCanvasStore.getState().updateDrawing3D({ x: local.x, y: local.y, z: local.z });
      }
    },
    [mode, isDrawing3D, trySnap3D]
  );

  const handleModelPointerLeave = useCallback(() => {
    setHoverPoint(null);
    setIsSnapped(false);
  }, []);

  const handleCanvasClick = useCallback(
    () => { if (!isMeasuring) selectMeasurement(null); },
    [isMeasuring, selectMeasurement]
  );

  // Model interaction handlers object for SceneObjectRenderer
  const modelHandlers = useMemo(() => ({
    onPointerDown: handleModelPointerDown,
    onPointerMove: handleModelPointerMove,
    onPointerLeave: handleModelPointerLeave,
    onModelScale: setModelScale,
  }), [handleModelPointerDown, handleModelPointerMove, handleModelPointerLeave]);

  return (
    <>
      {/* Lighting — ambient always, directional for models */}
      <ambientLight intensity={0.6} />
      {hasModels && (
        <>
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <directionalLight position={[-5, -5, -5]} intensity={0.3} />
        </>
      )}

      {/* Camera controls */}
      <SceneControls mode={cameraMode} disabled={isMeasuring} />

      {/* 3D navigation chrome */}
      {hasModels && (
        <>
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewcube />
          </GizmoHelper>
          <OriginAxes size={axisSize} />
        </>
      )}

      {/* Render all visible scene objects (Bvh accelerates raycasting for models) */}
      <Bvh firstHitOnly>
        {visibleObjects.map((obj) => (
          <SceneObjectRenderer
            key={obj.id}
            object={obj}
            imageHandlers={obj.type === 'image' ? imageInteraction : undefined}
            modelHandlers={obj.type === 'model' ? modelHandlers : undefined}
          />
        ))}
      </Bvh>

      {/* Transform gizmo on selected object */}
      <TransformGizmo />

      {/* Invisible click-catcher for deselection (3D mode) */}
      {hasModels && (
        <mesh visible={false} onPointerDown={handleCanvasClick}>
          <sphereGeometry args={[1000]} />
        </mesh>
      )}

      {/* 3D hover indicator */}
      {hoverPoint && hasModels && (mode === 'reference' || mode === 'measure') && (
        <HoverIndicator point={hoverPoint} scale={hoverSize} snapped={isSnapped} />
      )}

      {/* Image measurements + draw previews */}
      {hasImages && <ImageMeasurementLayer />}

      {/* Model measurements + draw previews */}
      {hasModels && <ModelMeasurementLayer modelScale={modelScale} />}
    </>
  );
}

// ---- Axis distance toggle overlay ----

function AxisDistanceToggle() {
  const show = useUIStore((s) => s.show3DAxisDistances);
  const toggle = useUIStore((s) => s.toggleShow3DAxisDistances);

  return (
    <button
      onClick={toggle}
      className={`absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-mono transition-colors ${
        show
          ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50'
          : 'bg-zinc-800/80 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'
      }`}
      title="Toggle cartesian decomposition"
    >
      Δxyz
    </button>
  );
}

// ---- Camera switcher (inside Canvas, avoids remount) ----

function CameraSwitch({ ortho }: { ortho: boolean }) {
  if (ortho) {
    return (
      <OrthographicCamera
        makeDefault
        position={[0, 0, 100]}
        zoom={1}
        near={0.1}
        far={1000}
      />
    );
  }
  return (
    <PerspectiveCamera
      makeDefault
      position={[0, 0, 5]}
      fov={50}
    />
  );
}

// ---- Main exported component ----

export function UnifiedScene() {
  const objects = useSceneObjectStore((s) => s.objects);

  // Auto-detect camera mode: perspective when any models are present
  const hasModels = objects.some((o) => o.type === 'model');

  return (
    <div className="relative w-full h-full">
      <Canvas
        style={{ background: hasModels ? '#1a1a2e' : '#09090b' }}
        onPointerMissed={() => {
          const state = useCanvasStore.getState();
          if (state.isDrawing) state.cancelDrawing();
          if (state.isDrawing3D) state.cancelDrawing3D();
        }}
      >
        <CameraSwitch ortho={!hasModels} />
        <UnifiedSceneContent />
      </Canvas>

      {hasModels && <AxisDistanceToggle />}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-border bg-background/95 p-1 shadow">
        <button type="button" aria-label="Zoom out" title="Zoom out (Ctrl −)" className="h-9 w-9 rounded hover:bg-accent" onClick={() => window.dispatchEvent(new CustomEvent('measureit:zoom', { detail: 1 / 1.25 }))}>−</button>
        <button type="button" aria-label="Zoom in" title="Zoom in (Ctrl +)" className="h-9 w-9 rounded hover:bg-accent" onClick={() => window.dispatchEvent(new CustomEvent('measureit:zoom', { detail: 1.25 }))}>+</button>
        <span className="px-2 text-[11px] text-muted-foreground">Ctrl + scroll</span>
      </div>
    </div>
  );
}
