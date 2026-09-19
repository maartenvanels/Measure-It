'use client';

import { useEffect, useState } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { screenToImage, pixelDist } from '@/lib/geometry';
import { calcRealDistance, calcRealArea } from '@/lib/calculations';
import type { Measurement, AreaMeasurement, AngleMeasurement, Annotation } from '@/types/measurement';

const modeLabels: Record<string, string> = {
  none: 'Navigate',
  reference: 'Reference',
  measure: 'Measure',
  'measure-chain': 'Chain',
  angle: 'Angle',
  area: 'Area (Polygon)',
  'area-polygon': 'Area (Polygon)',
  'area-freehand': 'Area (Freehand)',
  'area-circle-3pt': 'Area (Circle 3pt)',
  'area-circle-center': 'Area (Circle Center)',
  annotation: 'Annotate',
};

export function StatusBar() {
  const mode = useUIStore((s) => s.mode);
  const selectedId = useUIStore((s) => s.selectedMeasurementId);
  const zoom = useCanvasStore((s) => s.transform.zoom);
  const drawStart = useCanvasStore((s) => s.drawStart);
  const drawCurrent = useCanvasStore((s) => s.drawCurrent);
  const measurements = useMeasurementStore((s) => s.measurements);
  const globalRefValue = useMeasurementStore((s) => s.referenceValue);
  const globalRefUnit = useMeasurementStore((s) => s.referenceUnit);
  const getReference = useMeasurementStore((s) => s.getReference);
  const sceneObjects = useSceneObjectStore((s) => s.objects);
  const measureCount = measurements.length;

  const selected = selectedId ? measurements.find((m) => m.id === selectedId) : undefined;
  const selectedReadout = (() => {
    if (!selected) return null;
    const surface = (selected as Measurement).surface ?? 'image';
    const surfaceId = selected.surfaceId;
    const obj = surfaceId ? sceneObjects.find((o) => o.id === surfaceId) : undefined;
    const refValue = obj?.referenceValue ?? globalRefValue;
    const refUnit = obj?.referenceUnit ?? globalRefUnit;
    const ref = getReference(surface, surfaceId);

    if (selected.type === 'reference') return `${refValue} ${refUnit} (ref)`;
    if (selected.type === 'measure') {
      const m = selected as Measurement;
      return calcRealDistance(m.pixelLength, ref, refValue, refUnit, m.unitOverride)
        ?? `${m.pixelLength.toFixed(1)} px`;
    }
    if (selected.type === 'angle') {
      return `${(selected as AngleMeasurement).angleDeg.toFixed(2)}°`;
    }
    if (selected.type === 'area') {
      const a = selected as AreaMeasurement;
      return calcRealArea(a.pixelArea, ref, refValue, refUnit, a.unitOverride)
        ?? `${a.pixelArea.toFixed(1)} px²`;
    }
    if (selected.type === 'annotation') {
      return (selected as Annotation).content.slice(0, 40);
    }
    return null;
  })();

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const canvas = document.querySelector('canvas:last-of-type');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const transform = useCanvasStore.getState().transform;
      const pt = screenToImage(mx, my, transform);
      setMousePos({ x: Math.round(pt.x), y: Math.round(pt.y) });
    };
    window.addEventListener('pointermove', handler);
    return () => window.removeEventListener('pointermove', handler);
  }, []);

  const pxDist =
    drawStart && drawCurrent ? pixelDist(drawStart, drawCurrent).toFixed(1) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border bg-background px-4 py-1 text-[11px] text-muted-foreground">
      <span>
        Mode:{' '}
        <span className="text-foreground">{modeLabels[mode]}</span>
      </span>
      <span>
        Position:{' '}
        <span className="text-foreground">
          {mousePos ? `${mousePos.x}, ${mousePos.y}` : '--'}
        </span>
      </span>
      <span>
        Zoom:{' '}
        <span className="text-foreground">{Math.round(zoom * 100)}%</span>
      </span>
      {(mode === 'reference' || mode === 'measure' || mode === 'measure-chain') && (
        <span className="text-cyan-500">{drawStart ? 'Click end point · Esc to cancel' : 'Click start point'} · Ctrl + scroll to zoom</span>
      )}
      {pxDist && (
        <span>
          Distance:{' '}
          <span className="text-foreground">{pxDist} px</span>
        </span>
      )}
      {selected && selectedReadout && (
        <span className="truncate" title={`${selected.name ?? selected.type}: ${selectedReadout}`}>
          Selected:{' '}
          <span className="text-foreground font-mono">{selectedReadout}</span>
          <span className="ml-1 text-muted-foreground/70">— {selected.name ?? selected.type}</span>
        </span>
      )}
      <span className="ml-auto">
        {measureCount} measurement{measureCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
