'use client';

import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Point, DrawMode } from '@/types/measurement';
import { pixelDist, circumscribedCircle } from '@/lib/geometry';

/** Small dot at points, constant screen size */
function Dot({ position, color, zoom }: {
  position: [number, number, number];
  color: string;
  zoom: number;
}) {
  const radius = 4 / zoom;
  return (
    <mesh position={position}>
      <circleGeometry args={[radius, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/** Highlight ring around first point (for polygon closing) */
function CloseIndicator({ point, zoom }: { point: Point; zoom: number }) {
  const ringOuter = 8 / zoom;
  const ringInner = 6 / zoom;
  return (
    <mesh position={[point.x, -point.y, 0.025]}>
      <ringGeometry args={[ringInner, ringOuter, 32]} />
      <meshBasicMaterial color="#10b981" />
    </mesh>
  );
}

// ---- In-progress line (reference/measure) ----

interface DrawPreviewLineProps {
  start: Point;
  end: Point;
  mode: DrawMode;
  label: string;
}

export function DrawPreviewLine({ start, end, mode, label }: DrawPreviewLineProps) {
  const color = mode === 'reference' ? '#e11d48' : '#06b6d4';
  const startPos: [number, number, number] = [start.x, -start.y, 0.01];
  const endPos: [number, number, number] = [end.x, -end.y, 0.01];
  const midPos: [number, number, number] = [
    (start.x + end.x) / 2,
    -(start.y + end.y) / 2,
    0.02,
  ];

  return (
    <group>
      <Line points={[startPos, endPos]} color={color} lineWidth={2} dashed dashSize={6} gapSize={4} />
      <Html position={midPos} center style={{ pointerEvents: 'none' }}>
        <div className="rounded px-2 py-0.5 text-xs font-mono whitespace-nowrap"
          style={{ backgroundColor: 'rgba(9,9,11,0.9)', color, border: `1px solid ${color}` }}>
          {label}
        </div>
      </Html>
    </group>
  );
}

// ---- In-progress angle ----

interface DrawPreviewAngleProps {
  vertex: Point | null;
  armA: Point | null;
  cursorPos: Point | null;
}

export function DrawPreviewAngle({ vertex, armA, cursorPos }: DrawPreviewAngleProps) {
  const zoom = useThree((s) => (s.camera as THREE.OrthographicCamera).zoom || 1);
  const color = '#f59e0b';

  if (!vertex) return null;

  const vPos: [number, number, number] = [vertex.x, -vertex.y, 0.01];

  return (
    <group>
      <Dot position={vPos} color={color} zoom={zoom} />

      {armA && (
        <>
          <Line points={[vPos, [armA.x, -armA.y, 0.01]]} color={color} lineWidth={2} dashed dashSize={6} gapSize={4} />
          <Dot position={[armA.x, -armA.y, 0.01]} color={color} zoom={zoom} />

          {cursorPos && (
            <Line points={[vPos, [cursorPos.x, -cursorPos.y, 0.01]]} color={color} lineWidth={2} dashed dashSize={6} gapSize={4} />
          )}
        </>
      )}

      {!armA && cursorPos && (
        <Line points={[vPos, [cursorPos.x, -cursorPos.y, 0.01]]} color={color} lineWidth={2} dashed dashSize={6} gapSize={4} />
      )}
    </group>
  );
}

// ---- In-progress area (polygon) ----

interface DrawPreviewAreaProps {
  points: Point[];
  cursorPos: Point | null;
}

export function DrawPreviewArea({ points, cursorPos }: DrawPreviewAreaProps) {
  const zoom = useThree((s) => (s.camera as THREE.OrthographicCamera).zoom || 1);
  const color = '#10b981';


  // Build outline including cursor position
  const allPts = cursorPos ? [...points, cursorPos] : points;
  const linePoints: [number, number, number][] = allPts.map(
    (p) => [p.x, -p.y, 0.01] as [number, number, number]
  );

  // Fill preview
  const fillGeometry = useMemo(() => {
    if (allPts.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(allPts[0].x, -allPts[0].y);
    for (let i = 1; i < allPts.length; i++) {
      shape.lineTo(allPts[i].x, -allPts[i].y);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [allPts]);

  if (points.length === 0) return null;

  return (
    <group>
      {fillGeometry && (
        <mesh geometry={fillGeometry} position={[0, 0, 0.005]}>
          <meshBasicMaterial color={color} transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {linePoints.length > 1 && (
        <Line points={linePoints} color={color} lineWidth={2} dashed dashSize={6} gapSize={4} />
      )}

      {points.map((p, i) => (
        <Dot key={i} position={[p.x, -p.y, 0.015]} color={color} zoom={zoom} />
      ))}

      {/* Close indicator on first point */}
      {points.length >= 3 && <CloseIndicator point={points[0]} zoom={zoom} />}
    </group>
  );
}

// ---- In-progress freehand ----

interface DrawPreviewFreehandProps {
  points: Point[];
}

export function DrawPreviewFreehand({ points }: DrawPreviewFreehandProps) {
  const color = '#10b981';


  const linePoints: [number, number, number][] = points.map(
    (p) => [p.x, -p.y, 0.01] as [number, number, number]
  );

  const fillGeometry = useMemo(() => {
    if (points.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].y);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, -points[i].y);
    }
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [points]);

  if (points.length < 2) return null;

  return (
    <group>
      {fillGeometry && (
        <mesh geometry={fillGeometry} position={[0, 0, 0.005]}>
          <meshBasicMaterial color={color} transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      <Line points={linePoints} color={color} lineWidth={2} />
    </group>
  );
}

// ---- In-progress circle (3-point) ----

interface DrawPreviewCircle3PtProps {
  placedPoints: Point[];
  cursorPos: Point | null;
}

export function DrawPreviewCircle3Pt({ placedPoints, cursorPos }: DrawPreviewCircle3PtProps) {
  const zoom = useThree((s) => (s.camera as THREE.OrthographicCamera).zoom || 1);
  const color = '#10b981';

  const circlePreview = useMemo(() => {
    if (placedPoints.length >= 2 && cursorPos) {
      const pts = [...placedPoints, cursorPos];
      const result = circumscribedCircle(pts[0], pts[1], pts[2]);
      if (!result) return null;

      const segments = 64;
      const outlinePts: [number, number, number][] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        outlinePts.push([
          result.center.x + result.radius * Math.cos(angle),
          -result.center.y + result.radius * Math.sin(angle),
          0.01,
        ]);
      }
      return { outline: outlinePts, center: result.center, radius: result.radius };
    }
    return null;
  }, [placedPoints, cursorPos]);

  // Fill geometry for circle preview
  const fillGeometry = useMemo(() => {
    if (!circlePreview) return null;
    const shape = new THREE.Shape();
    shape.absarc(circlePreview.center.x, -circlePreview.center.y, circlePreview.radius, 0, Math.PI * 2, false);
    return new THREE.ShapeGeometry(shape, 64);
  }, [circlePreview]);

  return (
    <group>
      {/* Placed points */}
      {placedPoints.map((p, i) => (
        <Dot key={i} position={[p.x, -p.y, 0.015]} color={color} zoom={zoom} />
      ))}

      {/* Circle preview */}
      {circlePreview && (
        <>
          {fillGeometry && (
            <mesh geometry={fillGeometry} position={[0, 0, 0.005]}>
              <meshBasicMaterial color={color} transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          )}
          <Line points={circlePreview.outline} color={color} lineWidth={2} dashed dashSize={6} gapSize={4} />
        </>
      )}

      {/* Line from first point to cursor when only 1 point placed */}
      {placedPoints.length === 1 && cursorPos && (
        <Line
          points={[[placedPoints[0].x, -placedPoints[0].y, 0.01], [cursorPos.x, -cursorPos.y, 0.01]]}
          color={color}
          lineWidth={2}
          dashed
          dashSize={6}
          gapSize={4}
        />
      )}
    </group>
  );
}

// ---- In-progress circle (center + edge) ----

interface DrawPreviewCircleCenterProps {
  center: Point;
  cursorPos: Point | null;
}

export function DrawPreviewCircleCenter({ center, cursorPos }: DrawPreviewCircleCenterProps) {
  const zoom = useThree((s) => (s.camera as THREE.OrthographicCamera).zoom || 1);
  const color = '#10b981';

  const circlePreview = useMemo(() => {
    if (!cursorPos) return null;
    const radius = pixelDist(center, cursorPos);
    if (radius < 3) return null;

    const segments = 64;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push([
        center.x + radius * Math.cos(angle),
        -center.y + radius * Math.sin(angle),
        0.01,
      ]);
    }
    return { outline: pts, radius };
  }, [center, cursorPos]);

  const fillGeometry = useMemo(() => {
    if (!circlePreview) return null;
    const shape = new THREE.Shape();
    shape.absarc(center.x, -center.y, circlePreview.radius, 0, Math.PI * 2, false);
    return new THREE.ShapeGeometry(shape, 64);
  }, [center, circlePreview]);

  return (
    <group>
      {/* Center dot */}
      <Dot position={[center.x, -center.y, 0.015]} color={color} zoom={zoom} />

      {circlePreview && cursorPos && (
        <>
          {fillGeometry && (
            <mesh geometry={fillGeometry} position={[0, 0, 0.005]}>
              <meshBasicMaterial color={color} transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          )}
          <Line points={circlePreview.outline} color={color} lineWidth={2} dashed dashSize={6} gapSize={4} />
          {/* Radius line */}
          <Line
            points={[[center.x, -center.y, 0.01], [cursorPos.x, -cursorPos.y, 0.01]]}
            color={color}
            lineWidth={1.5}
            dashed
            dashSize={6}
            gapSize={4}
          />
        </>
      )}
    </group>
  );
}
