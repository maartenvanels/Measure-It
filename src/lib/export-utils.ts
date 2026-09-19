import { Measurement, AngleMeasurement, AreaMeasurement, Annotation, AnyMeasurement, Unit } from '@/types/measurement';
import { calcRealValue, convertUnit } from './calculations';
import { drawMeasurementLine, drawAngleMeasurement, drawAreaMeasurement, drawCircleAreaMeasurement, drawFreehandAreaMeasurement, drawAnnotationLeader, drawLabel } from './canvas-rendering';
import { calcRealDistance, calcRealArea } from './calculations';
import { hasLatex, renderNameLabelImage } from './latex-export';

/** Resolver function that returns the reference measurement + scale for a given measurement */
export type RefResolver = (m: AnyMeasurement) => {
  ref: Measurement | undefined;
  refValue: number;
  refUnit: Unit;
  objectName?: string;
};

/** Build a simple (legacy) resolver from global values */
export function buildSimpleResolver(
  refValue: number,
  refUnit: Unit,
  imageRef?: Measurement,
  modelRef?: Measurement,
): RefResolver {
  return (m) => {
    const surface = (m.type === 'reference' || m.type === 'measure')
      ? ((m as Measurement).surface ?? 'image')
      : 'image';
    return {
      ref: surface === 'model' ? modelRef : imageRef,
      refValue,
      refUnit,
    };
  };
}

export function generateCSV(
  measurements: AnyMeasurement[],
  resolve: RefResolver,
): string {
  let csv = `Name,Type,Object,Surface,Value,Unit,Pixel Length,Angle (deg),Pixel Area,3D Distance\n`;
  for (const m of measurements) {
    const { ref, refValue, refUnit, objectName } = resolve(m);
    const objCol = objectName ? `"${objectName}"` : '';
    if (m.type === 'annotation') {
      const content = (m as Annotation).content.replace(/"/g, '""').slice(0, 100);
      csv += `"${content}",annotation,${objCol},,,,,,,\n`;
    } else if (m.type === 'area') {
      const area = m as AreaMeasurement;
      const unit = area.unitOverride ?? refUnit;
      const realArea = calcRealArea(area.pixelArea, ref, refValue, refUnit, area.unitOverride);
      csv += `"${m.name}",area,${objCol},image,"${realArea ?? ''}",${unit},,,"${area.pixelArea.toFixed(2)}",\n`;
    } else if (m.type === 'angle') {
      csv += `"${m.name}",angle,${objCol},image,"${m.angleDeg.toFixed(2)}°",deg,,,,\n`;
    } else {
      const meas = m as Measurement;
      const surface = meas.surface ?? 'image';
      const unit = meas.unitOverride ?? refUnit;
      const real =
        m.type === 'reference'
          ? `${convertUnit(refValue, refUnit, unit)}`
          : (calcRealDistance(meas.pixelLength, ref, refValue, refUnit, meas.unitOverride)?.replace(` ${unit}`, '') ?? '');
      const dist3D = meas.distance != null ? meas.distance.toFixed(4) : '';
      csv += `"${m.name}",${m.type},${objCol},${surface},"${real}",${unit},${meas.pixelLength.toFixed(2)},,,${dist3D}\n`;
    }
  }
  return csv;
}

export function generateJSON(
  measurements: AnyMeasurement[],
  resolve: RefResolver,
): string {
  const data = measurements.map((m) => {
    const { ref, refValue, refUnit, objectName } = resolve(m);
    if (m.type === 'annotation') {
      const ann = m as Annotation;
      return {
        type: 'annotation' as const,
        content: ann.content,
        position: { x: Math.round(ann.position.x), y: Math.round(ann.position.y) },
        color: ann.color,
        ...(objectName ? { object: objectName } : {}),
        ...(ann.arrowTarget ? { arrowTarget: { x: Math.round(ann.arrowTarget.x), y: Math.round(ann.arrowTarget.y) } } : {}),
      };
    }
    if (m.type === 'area') {
      const area = m as AreaMeasurement;
      const realArea = calcRealArea(area.pixelArea, ref, refValue, refUnit, area.unitOverride);
      return {
        name: m.name,
        type: 'area' as const,
        ...(objectName ? { object: objectName } : {}),
        areaKind: area.areaKind,
        pixelArea: Math.round(area.pixelArea * 100) / 100,
        realArea: realArea ?? null,
        unit: area.unitOverride ?? refUnit,
        points: area.points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
        ...(area.center ? { center: { x: Math.round(area.center.x), y: Math.round(area.center.y) } } : {}),
        ...(area.radius != null ? { radius: Math.round(area.radius * 100) / 100 } : {}),
      };
    }
    if (m.type === 'angle') {
      return {
        name: m.name,
        type: 'angle' as const,
        ...(objectName ? { object: objectName } : {}),
        angleDeg: Math.round(m.angleDeg * 100) / 100,
        coordinates: {
          vertex: { x: Math.round(m.vertex.x), y: Math.round(m.vertex.y) },
          armA: { x: Math.round(m.armA.x), y: Math.round(m.armA.y) },
          armB: { x: Math.round(m.armB.x), y: Math.round(m.armB.y) },
        },
      };
    }
    const meas = m as Measurement;
    const surface = meas.surface ?? 'image';
    const rawValue =
      m.type === 'reference'
        ? refValue
        : calcRealValue(meas.pixelLength, ref, refValue);
    const realValue = rawValue == null ? null : convertUnit(rawValue, refUnit, meas.unitOverride ?? refUnit);
    return {
      name: m.name,
      type: m.type,
      ...(objectName ? { object: objectName } : {}),
      surface,
      pixelLength: Math.round(meas.pixelLength * 100) / 100,
      realValue: realValue != null && Number.isFinite(realValue) ? Math.round(realValue * 100) / 100 : null,
      unit: meas.unitOverride ?? refUnit,
      ...(meas.start3D ? {
        coordinates3D: {
          start: { x: meas.start3D.x, y: meas.start3D.y, z: meas.start3D.z },
          end: { x: meas.end3D!.x, y: meas.end3D!.y, z: meas.end3D!.z },
        },
        distance: meas.distance != null ? Math.round(meas.distance * 10000) / 10000 : undefined,
      } : {
        coordinates: {
          x1: Math.round(meas.start.x),
          y1: Math.round(meas.start.y),
          x2: Math.round(meas.end.x),
          y2: Math.round(meas.end.y),
        },
      }),
    };
  });
  return JSON.stringify(data, null, 2);
}

export function generateClipboardText(
  measurements: AnyMeasurement[],
  resolve: RefResolver,
): string {
  let text = 'Measurements:\n';
  for (const m of measurements) {
    const { ref, refValue, refUnit, objectName } = resolve(m);
    const prefix = objectName ? `[${objectName}] ` : '';
    if (m.type === 'annotation') {
      const content = (m as Annotation).content.slice(0, 60).replace(/\n/g, ' ');
      text += `  ${prefix}[Note] ${content}\n`;
    } else if (m.type === 'area') {
      const area = m as AreaMeasurement;
      const val = calcRealArea(area.pixelArea, ref, refValue, refUnit, area.unitOverride) ?? `${area.pixelArea.toFixed(0)} px\u00B2`;
      text += `  ${prefix}${m.name}: ${val}\n`;
    } else if (m.type === 'angle') {
      text += `  ${prefix}${m.name}: ${m.angleDeg.toFixed(1)}\u00B0\n`;
    } else {
      const meas = m as Measurement;
      const surface = meas.surface ?? 'image';
      const suffix = surface === 'model' ? ' (3D)' : '';
      const val =
        m.type === 'reference'
          ? `${refValue} ${refUnit} (${surface === 'model' ? '3D ' : ''}reference)`
          : (calcRealDistance(meas.pixelLength, ref, refValue, refUnit, meas.unitOverride) ??
            `${meas.pixelLength.toFixed(1)} px`);
      text += `  ${prefix}${m.name}${suffix}: ${val}\n`;
    }
  }
  return text;
}

/**
 * Compute the position where a name label should be drawn for export.
 * Transform is always {panX:0, panY:0, zoom:1} so image coords = screen coords.
 */
function getExportNameLabelPos(m: AnyMeasurement): { x: number; y: number } | null {
  if (m.type === 'annotation' || !m.name) return null;
  // Skip model-surface measurements (rendered in 3D scene, not on export canvas)
  if ((m.type === 'reference' || m.type === 'measure') && (m as Measurement).surface === 'model') return null;

  let x: number;
  let y: number;

  if (m.type === 'angle') {
    const v = m.vertex;
    const a = m.armA;
    const b = m.armB;
    const angleA = Math.atan2(a.y - v.y, a.x - v.x);
    const angleB = Math.atan2(b.y - v.y, b.x - v.x);
    let diff = angleB - angleA;
    if (diff < 0) diff += Math.PI * 2;
    let labelAngle = (angleA + angleB) / 2;
    if (diff > Math.PI) labelAngle += Math.PI;
    const arcRadius = Math.min(30, Math.max(15, 20)); // zoom=1
    const labelDist = arcRadius + 18;
    x = v.x + labelDist * Math.cos(labelAngle);
    y = v.y + labelDist * Math.sin(labelAngle) + 22;
  } else if (m.type === 'area') {
    if (m.center) {
      x = m.center.x;
      y = m.center.y + 22;
    } else {
      x = m.points.reduce((s, p) => s + p.x, 0) / m.points.length;
      y = m.points.reduce((s, p) => s + p.y, 0) / m.points.length + 22;
    }
  } else {
    const meas = m as Measurement;
    x = (meas.start.x + meas.end.x) / 2;
    y = (meas.start.y + meas.end.y) / 2 + 18;
  }

  // Apply nameLabelOffset (zoom=1 so direct)
  const nameLabelOffset = (m as Measurement).nameLabelOffset;
  if (nameLabelOffset) {
    x += nameLabelOffset.x;
    y += nameLabelOffset.y;
  }

  return { x, y };
}

export async function renderAnnotatedImage(
  image: HTMLImageElement,
  measurements: AnyMeasurement[],
  resolve: RefResolver,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(image, 0, 0);

  const transform = { panX: 0, panY: 0, zoom: 1 };

  // Draw all measurements with skipNameLabel=true (we render names separately)
  for (const m of measurements) {
    const { ref, refValue, refUnit } = resolve(m);
    if (m.type === 'annotation') {
      const ann = m as Annotation;
      const color = ann.color ?? '#a855f7';
      const fontSize = ann.fontSize ?? 14;
      const plainText = ann.content.replace(/[#*_~`$\\]/g, '').trim().slice(0, 50);
      if (ann.arrowTarget) {
        drawAnnotationLeader(ctx, ann, false, transform);
      }
      if (plainText) {
        drawLabel(ctx, ann.position.x, ann.position.y, plainText, color, fontSize);
      }
    } else if (m.type === 'area') {
      const area = m as AreaMeasurement;
      const label = calcRealArea(area.pixelArea, ref, refValue, refUnit, area.unitOverride) ?? `${area.pixelArea.toFixed(0)} px\u00B2`;
      if (area.areaKind === 'circle-3pt' || area.areaKind === 'circle-center') {
        drawCircleAreaMeasurement(ctx, area, false, transform, label, undefined, true);
      } else if (area.areaKind === 'freehand') {
        drawFreehandAreaMeasurement(ctx, area, false, transform, label, undefined, true);
      } else {
        drawAreaMeasurement(ctx, area, false, transform, label, undefined, true);
      }
    } else if (m.type === 'angle') {
      drawAngleMeasurement(ctx, m, false, transform, undefined, true);
    } else {
      const meas = m as Measurement;
      const label =
        m.type === 'reference'
          ? `${refValue} ${refUnit} (ref)`
          : (calcRealDistance(meas.pixelLength, ref, refValue, refUnit, meas.unitOverride) ??
            `${meas.pixelLength.toFixed(1)} px`);
      drawMeasurementLine(ctx, meas, false, transform, label, m.name, undefined, true);
    }
  }

  // Render name labels (with LaTeX support for names containing $...$)
  const nameLabels = measurements
    .filter((m): m is Measurement | AngleMeasurement | AreaMeasurement =>
      m.type !== 'annotation' && !!m.name
    );

  for (const m of nameLabels) {
    const pos = getExportNameLabelPos(m);
    if (!pos) continue;

    const fontSize = Math.max(9, (m.fontSize ?? 13) - 2);

    if (hasLatex(m.name)) {
      try {
        const { img, width, height } = await renderNameLabelImage(
          m.name, fontSize, '#71717a'
        );
        // drawImage at 2x rendered size → draw at original size
        ctx.drawImage(img, pos.x - width / 2, pos.y - height / 2, width, height);
      } catch {
        // Fallback to plain text if LaTeX rendering fails
        drawLabel(ctx, pos.x, pos.y, m.name, '#71717a', fontSize);
      }
    } else {
      drawLabel(ctx, pos.x, pos.y, m.name, '#71717a', fontSize);
    }
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}
