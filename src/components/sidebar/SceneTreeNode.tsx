'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Lock, Unlock, Trash2 } from 'lucide-react';
import type { Measurement, AreaMeasurement, Annotation, AnyMeasurement } from '@/types/measurement';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { useUIStore } from '@/stores/useUIStore';
import { calcRealDistance, calcRealArea } from '@/lib/calculations';
import { getMeasurementColor } from '@/lib/canvas-rendering';

interface Props {
  measurement: AnyMeasurement;
}

function useDisplayValue(m: AnyMeasurement): string {
  const globalRefValue = useMeasurementStore((s) => s.referenceValue);
  const globalRefUnit = useMeasurementStore((s) => s.referenceUnit);
  const isModelSurface = (m.type === 'reference' || m.type === 'measure') && (m as Measurement).surface === 'model';
  const surfaceId = m.surfaceId;

  // Per-object reference: look up the SceneObject for this measurement
  const sceneObject = useSceneObjectStore((s) =>
    surfaceId ? s.objects.find((o) => o.id === surfaceId) : undefined
  );
  const referenceValue = sceneObject?.referenceValue ?? globalRefValue;
  const referenceUnit = sceneObject?.referenceUnit ?? globalRefUnit;

  // Get the reference measurement for this specific object (or surface fallback)
  const reference = useMeasurementStore((s) =>
    s.getReference(isModelSurface ? 'model' : 'image', surfaceId)
  );

  if (m.type === 'annotation') {
    return (m as Annotation).content.replace(/[#*_~`$\\]/g, '').slice(0, 30) || 'Empty';
  }
  if (m.type === 'area') {
    const area = m as AreaMeasurement;
    return calcRealArea(area.pixelArea, reference, referenceValue, referenceUnit, area.unitOverride)
      ?? `${area.pixelArea.toFixed(0)} px\u00B2`;
  }
  if (m.type === 'angle') {
    return `${(m as unknown as { angleDeg: number }).angleDeg.toFixed(1)}\u00B0`;
  }
  if (m.type === 'reference') {
    return `${referenceValue} ${referenceUnit}`;
  }
  // measure
  const meas = m as Measurement;
  if (meas.combineOperation === 'area') return calcRealArea(meas.combinedPixelArea ?? 0, reference, referenceValue, referenceUnit, meas.unitOverride)
    ?? `${(meas.combinedPixelArea ?? 0).toFixed(2)} px²`;
  return calcRealDistance(meas.pixelLength, reference, referenceValue, referenceUnit, meas.unitOverride)
    ?? `${meas.pixelLength.toFixed(1)} px`;
}

export function SceneTreeNode({ measurement: m }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(m.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedId = useUIStore((s) => s.selectedMeasurementId);
  const selectedIds = useUIStore((s) => s.selectedMeasurementIds);
  const selectMeasurement = useUIStore((s) => s.selectMeasurement);
  const toggleVisibility = useMeasurementStore((s) => s.toggleVisibility);
  const toggleLocked = useMeasurementStore((s) => s.toggleLocked);
  const renameMeasurement = useMeasurementStore((s) => s.renameMeasurement);
  const removeMeasurement = useMeasurementStore((s) => s.removeMeasurement);

  const isSelected = selectedIds.includes(m.id) || m.id === selectedId;
  const isVisible = m.visible !== false;
  const isLocked = m.locked === true;
  const color = getMeasurementColor(m);
  const displayValue = useDisplayValue(m);

  const displayName = m.type === 'annotation'
    ? (m.name || (m as Annotation).content.replace(/[#*_~`$\\]/g, '').slice(0, 30) || 'Annotation')
    : (m.name || m.type);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (trimmed !== (m.name ?? '')) {
      renameMeasurement(m.id, trimmed);
    }
  }, [editValue, m.id, m.name, renameMeasurement]);

  return (
    <div
      className={`group flex items-center gap-1 py-0.5 px-1 rounded text-xs cursor-pointer select-none ${
        isSelected ? 'bg-accent' : 'hover:bg-accent/50'
      } ${!isVisible ? 'opacity-40' : ''}`}
      onClick={(e) => selectMeasurement(m.id, e.ctrlKey || e.metaKey)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isLocked) {
          setEditValue(m.name ?? '');
          setEditing(true);
        }
      }}
    >
      {/* Color dot */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Name or inline edit */}
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="flex-1 bg-transparent text-xs outline-none min-w-0 border-b border-accent"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate" title={displayName}>{displayName}</span>
      )}

      {/* Value */}
      {m.type !== 'annotation' && (
        <span
          className="flex-shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
          title={displayValue}
        >
          {displayValue}
        </span>
      )}

      {/* Eye toggle */}
      <button
        className={`p-0.5 rounded transition-opacity ${
          isVisible ? 'opacity-0 group-hover:opacity-100' : 'opacity-60'
        }`}
        onClick={(e) => { e.stopPropagation(); toggleVisibility(m.id); }}
        title={isVisible ? 'Hide' : 'Show'}
      >
        {isVisible ? (
          <Eye className="h-3 w-3 text-muted-foreground" />
        ) : (
          <EyeOff className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {/* Lock toggle */}
      <button
        className={`p-0.5 rounded transition-opacity ${
          isLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        onClick={(e) => { e.stopPropagation(); toggleLocked(m.id); }}
        title={isLocked ? 'Unlock' : 'Lock'}
      >
        {isLocked ? (
          <Lock className="h-3 w-3 text-amber-500" />
        ) : (
          <Unlock className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {/* Delete */}
      <button
        className="p-0.5 rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-rose-500/20"
        onClick={(e) => {
          e.stopPropagation();
          if (isLocked) return;
          removeMeasurement(m.id);
        }}
        title={isLocked ? 'Unlock first to delete' : 'Delete'}
        disabled={isLocked}
      >
        <Trash2 className="h-3 w-3 text-rose-400" />
      </button>
    </div>
  );
}
