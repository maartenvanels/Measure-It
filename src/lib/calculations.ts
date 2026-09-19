import { Measurement, Unit } from '@/types/measurement';

const UNIT_TO_MM: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  px: 1,
};

export function convertUnit(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  if (from === 'px' || to === 'px') return value;
  return value * (UNIT_TO_MM[from] / UNIT_TO_MM[to]);
}

/**
 * Calculate real distance from pixel/model length using a reference measurement.
 * Works for both 2D image (pixelLength) and 3D model (distance) measurements —
 * just pass the matching-surface reference.
 */
export function calcRealDistance(
  pixelLength: number,
  reference: Measurement | undefined,
  refValue: number,
  refUnit: Unit,
  displayUnit?: Unit
): string | null {
  if (!reference || !Number.isFinite(refValue) || refValue <= 0 || !Number.isFinite(reference.pixelLength) || reference.pixelLength <= 0 || !Number.isFinite(pixelLength)) return null;
  const ratio = refValue / reference.pixelLength;
  let realDist = pixelLength * ratio;
  const unit = displayUnit ?? refUnit;
  if (displayUnit && displayUnit !== refUnit) {
    realDist = convertUnit(realDist, refUnit, displayUnit);
  }
  return `${realDist.toFixed(2)} ${unit}`;
}

export function calcRealValue(
  pixelLength: number,
  reference: Measurement | undefined,
  refValue: number
): number | null {
  if (!reference || !Number.isFinite(refValue) || refValue <= 0 || !Number.isFinite(reference.pixelLength) || reference.pixelLength <= 0 || !Number.isFinite(pixelLength)) return null;
  const ratio = refValue / reference.pixelLength;
  return pixelLength * ratio;
}

export function calcRealArea(
  pixelArea: number,
  reference: Measurement | undefined,
  refValue: number,
  refUnit: Unit,
  displayUnit?: Unit
): string | null {
  if (!reference || !Number.isFinite(refValue) || refValue <= 0 || !Number.isFinite(reference.pixelLength) || reference.pixelLength <= 0 || !Number.isFinite(pixelArea)) return null;
  const scale = refValue / reference.pixelLength;
  let realArea = pixelArea * scale * scale;
  const unit = displayUnit ?? refUnit;
  if (displayUnit && displayUnit !== refUnit) {
    const linearFactor = UNIT_TO_MM[refUnit] / UNIT_TO_MM[displayUnit];
    realArea = realArea * linearFactor * linearFactor;
  }
  return `${realArea.toFixed(2)} ${unit}\u00B2`;
}
