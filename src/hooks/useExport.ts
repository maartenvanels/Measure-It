'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import type { AnyMeasurement, Measurement } from '@/types/measurement';
import type { RefResolver } from '@/lib/export-utils';
import {
  generateCSV,
  generateJSON,
  generateClipboardText,
  renderAnnotatedImage,
  downloadBlob,
  downloadText,
} from '@/lib/export-utils';

/** Build a RefResolver that uses per-object reference scales */
function buildResolver(): RefResolver {
  const { referenceValue, referenceUnit, getReference } = useMeasurementStore.getState();
  const { objects } = useSceneObjectStore.getState();

  return (m: AnyMeasurement) => {
    const surface = (m.type === 'reference' || m.type === 'measure')
      ? ((m as Measurement).surface ?? 'image')
      : 'image';
    const obj = m.surfaceId ? objects.find((o) => o.id === m.surfaceId) : undefined;
    return {
      ref: getReference(surface as 'image' | 'model', m.surfaceId),
      refValue: obj?.referenceValue ?? referenceValue,
      refUnit: obj?.referenceUnit ?? referenceUnit,
      objectName: obj?.name,
    };
  };
}

export function useExport() {
  const exportCSV = useCallback(() => {
    const { measurements } = useMeasurementStore.getState();
    const csv = generateCSV(measurements, buildResolver());
    downloadText(csv, 'measurements.csv', 'text/csv');
    toast.success('CSV exported');
  }, []);

  const exportJSON = useCallback(() => {
    const { measurements } = useMeasurementStore.getState();
    const json = generateJSON(measurements, buildResolver());
    downloadText(json, 'measurements.json', 'application/json');
    toast.success('JSON exported');
  }, []);

  const exportClipboard = useCallback(async () => {
    const { measurements } = useMeasurementStore.getState();
    const text = generateClipboardText(measurements, buildResolver());
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }, []);

  const exportImage = useCallback(async () => {
    const scene = useSceneObjectStore.getState();
    const active = scene.getActiveObject();
    const visibleImages = scene.objects.filter(o => o.type === 'image' && o.visible && o.image);
    const source = active?.type === 'image' && active.visible ? active : visibleImages.length === 1 ? visibleImages[0] : undefined;
    if (!source?.image) { toast.info('Select the image you want to export in the scene browser.'); return; }
    const { measurements } = useMeasurementStore.getState();
    const imageMeasurements = measurements.filter(m => m.visible !== false && (m.surfaceId === source.id || (!m.surfaceId && visibleImages.length === 1))
      && !((m.type === 'measure' || m.type === 'reference') && (m.surface === 'model' || m.combinedFrom)));
    try {
      const blob = await renderAnnotatedImage(source.image, imageMeasurements, buildResolver());
      downloadBlob(blob, source.name.replace(/\.[^.]+$/, '') + '-measured.png');
      toast.success('Selected image exported');
    } catch { toast.error('Could not export the image.'); }
  }, []);

  return { exportCSV, exportJSON, exportClipboard, exportImage };
}
