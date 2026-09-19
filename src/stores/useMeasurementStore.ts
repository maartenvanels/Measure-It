import { create } from 'zustand';
import { Measurement, AngleMeasurement, AreaMeasurement, Annotation, AnyMeasurement, MeasurementSurface, Unit } from '@/types/measurement';

export function refreshCombinedTotals(items: AnyMeasurement[]): AnyMeasurement[] {
  const byId = new Map(items.map((m) => [m.id, m]));
  return items.map((m) => {
    if (m.type !== 'measure' || !m.combinedFrom) return m;
    const parts = m.combinedFrom.map((id) => byId.get(id));
    if (parts.some((part) => !part || part.type !== 'measure')) return m;
    const length = parts.reduce((sum, part) => sum + (part as Measurement).pixelLength, 0);
    if (m.combineOperation === 'area') return { ...m, combinedPixelArea: (parts[0] as Measurement).pixelLength * (parts[1] as Measurement).pixelLength };
    return { ...m, pixelLength: length, ...(m.surface === 'model' ? { distance: length } : {}) };
  });
}

interface MeasurementState {
  measurements: AnyMeasurement[];
  referenceValue: number;
  referenceUnit: Unit;
  past: AnyMeasurement[][];
  future: AnyMeasurement[][];

  addMeasurement: (m: Measurement) => void;
  addAngle: (a: AngleMeasurement) => void;
  addArea: (a: AreaMeasurement) => void;
  addAnnotation: (a: Annotation) => void;
  updateMeasurement: (id: string, patch: Record<string, unknown>) => void;
  removeMeasurement: (id: string) => void;
  renameMeasurement: (id: string, name: string) => void;
  /**
   * Add lengths, or multiply exactly two dimensions into a rectangular area.
   * Constituent lines must belong to the same source.
   */
  combineMeasurements: (ids: string[], operation?: 'sum' | 'area') => { ok: true; id: string } | { ok: false; reason: string };
  setReferenceValue: (value: number) => void;
  setReferenceUnit: (unit: Unit) => void;
  clearAll: () => void;
  undo: () => void;
  redo: () => void;
  /** Get the reference measurement, optionally filtered by surface and/or surfaceId */
  getReference: (surface?: MeasurementSurface, surfaceId?: string) => Measurement | undefined;
  getMeasureCount: (surface?: MeasurementSurface, surfaceId?: string) => number;
  getAngleCount: (surfaceId?: string) => number;
  getAreaCount: (surfaceId?: string) => number;
  getAnnotationCount: (surfaceId?: string) => number;
  getMeasurementsForObject: (surfaceId: string) => AnyMeasurement[];
  toggleVisibility: (id: string) => void;
  toggleLocked: (id: string) => void;
  setGroupVisibility: (ids: string[], visible: boolean) => void;
  adjustAllCoordinates: (dx: number, dy: number, surfaceId?: string) => void;
}

export const useMeasurementStore = create<MeasurementState>((set, get) => ({
  measurements: [],
  referenceValue: 100,
  referenceUnit: 'mm',
  past: [],
  future: [],

  addMeasurement: (m) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    const surface = m.surface ?? 'image';

    if (m.type === 'reference') {
      // Replace the existing reference for the same surface/object
      set({
        measurements: [m, ...measurements.filter((x) => {
          if (x.type !== 'reference') return true;
          const xm = x as Measurement;
          // If surfaceId is set, only replace reference for the same object
          if (m.surfaceId) return xm.surfaceId !== m.surfaceId;
          // Legacy: replace by surface type
          return ((xm.surface ?? 'image') !== surface);
        })],
        past,
        future: [],
      });
    } else {
      set({
        measurements: [...measurements, m],
        past,
        future: [],
      });
    }
  },

  addAngle: (a) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    set({
      measurements: [...measurements, a],
      past,
      future: [],
    });
  },

  addArea: (a) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    set({ measurements: [...measurements, a], past, future: [] });
  },

  addAnnotation: (a) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    set({ measurements: [...measurements, a], past, future: [] });
  },

  updateMeasurement: (id, patch) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    set({
      measurements: refreshCombinedTotals(measurements.map((m) =>
        m.id === id ? { ...m, ...patch } as AnyMeasurement : m
      )),
      past,
      future: [],
    });
  },

  removeMeasurement: (id) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    // Cascade: remove any combined-total that references this measurement.
    const remaining = measurements.filter((m) => {
      if (m.id === id) return false;
      if (m.type === 'measure') {
        const combined = (m as Measurement).combinedFrom;
        if (combined && combined.includes(id)) return false;
      }
      return true;
    });
    set({ measurements: remaining, past, future: [] });
  },

  renameMeasurement: (id, name) => {
    set({
      measurements: get().measurements.map((m) =>
        m.id === id ? { ...m, name } : m
      ),
    });
  },

  combineMeasurements: (ids, operation = 'sum') => {
    const { measurements } = get();
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length < 2) return { ok: false, reason: 'Need at least 2 different measurements' };
    if (operation === 'area' && uniqueIds.length !== 2) return { ok: false, reason: 'Select exactly two dimensions for length × width' };

    const segments = uniqueIds.map((id) => measurements.find((m) => m.id === id));
    if (segments.some((s) => !s)) return { ok: false, reason: 'Measurement not found' };
    const items = segments as AnyMeasurement[];
    if (items.some((m) => m.type !== 'measure')) {
      return { ok: false, reason: 'Only measure-type lines can be combined' };
    }
    const meas = items as Measurement[];
    if (meas.some((m) => m.combinedFrom)) {
      return { ok: false, reason: 'Cannot combine an already-combined total' };
    }

    const surface = meas[0].surface ?? 'image';
    const surfaceId = meas[0].surfaceId;
    if (meas.some((m) => (m.surface ?? 'image') !== surface || m.surfaceId !== surfaceId)) {
      return { ok: false, reason: 'Measurements must be on the same object' };
    }

    const totalPixelLength = meas.reduce((sum, m) => sum + m.pixelLength, 0);
    // Short name; expand the sub-tree in the sidebar to see which segments make up the total.
    const combined: Measurement = {
      id: crypto.randomUUID(),
      type: 'measure',
      name: operation === 'area' ? 'Area (length × width)' : `Total ×${meas.length}`,
      createdAt: Date.now(),
      surface,
      surfaceId,
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      pixelLength: totalPixelLength,
      ...(surface === 'model' ? { distance: totalPixelLength } : {}),
      combinedFrom: uniqueIds,
      combineOperation: operation,
      ...(operation === 'area' ? { pixelLength: 0, distance: undefined, combinedPixelArea: meas[0].pixelLength * meas[1].pixelLength } : {}),
    };

    const past = [...get().past, [...measurements]].slice(-50);
    set({ measurements: [...measurements, combined], past, future: [] });
    return { ok: true, id: combined.id };
  },

  setReferenceValue: (value) => set({ referenceValue: value }),
  setReferenceUnit: (unit) => set({ referenceUnit: unit }),

  clearAll: () => {
    const { measurements } = get();
    if (measurements.length === 0) return;
    const past = [...get().past, [...measurements]].slice(-50);
    set({ measurements: [], past, future: [] });
  },

  undo: () => {
    const { past, measurements, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      measurements: previous,
      past: past.slice(0, -1),
      future: [measurements, ...future].slice(0, 50),
    });
  },

  redo: () => {
    const { past, measurements, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      measurements: next,
      past: [...past, measurements].slice(-50),
      future: future.slice(1),
    });
  },

  getReference: (surface, surfaceId) => {
    if (surfaceId) {
      return get().measurements.find(
        (m): m is Measurement => m.type === 'reference' && (m as Measurement).surfaceId === surfaceId
      );
    }
    const s = surface ?? 'image';
    return get().measurements.find(
      (m): m is Measurement => m.type === 'reference' && ((m as Measurement).surface ?? 'image') === s
    );
  },

  getMeasureCount: (surface, surfaceId) => {
    if (surfaceId) {
      return get().measurements.filter(
        (m) => m.type === 'measure' && (m as Measurement).surfaceId === surfaceId
      ).length;
    }
    if (surface) {
      return get().measurements.filter(
        (m) => m.type === 'measure' && ((m as Measurement).surface ?? 'image') === surface
      ).length;
    }
    return get().measurements.filter((m) => m.type === 'measure').length;
  },

  getAngleCount: (surfaceId) => {
    if (surfaceId) {
      return get().measurements.filter((m) => m.type === 'angle' && m.surfaceId === surfaceId).length;
    }
    return get().measurements.filter((m) => m.type === 'angle').length;
  },
  getAreaCount: (surfaceId) => {
    if (surfaceId) {
      return get().measurements.filter((m) => m.type === 'area' && m.surfaceId === surfaceId).length;
    }
    return get().measurements.filter((m) => m.type === 'area').length;
  },
  getAnnotationCount: (surfaceId) => {
    if (surfaceId) {
      return get().measurements.filter((m) => m.type === 'annotation' && m.surfaceId === surfaceId).length;
    }
    return get().measurements.filter((m) => m.type === 'annotation').length;
  },

  getMeasurementsForObject: (surfaceId) => {
    return get().measurements.filter((m) => m.surfaceId === surfaceId);
  },

  toggleVisibility: (id) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    set({
      measurements: measurements.map((m) =>
        m.id === id ? { ...m, visible: m.visible === false ? undefined : false } as AnyMeasurement : m
      ),
      past,
      future: [],
    });
  },

  toggleLocked: (id) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    set({
      measurements: measurements.map((m) =>
        m.id === id ? { ...m, locked: m.locked ? undefined : true } as AnyMeasurement : m
      ),
      past,
      future: [],
    });
  },

  setGroupVisibility: (ids, visible) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    const idSet = new Set(ids);
    set({
      measurements: measurements.map((m) =>
        idSet.has(m.id) ? { ...m, visible: visible ? undefined : false } as AnyMeasurement : m
      ),
      past,
      future: [],
    });
  },

  adjustAllCoordinates: (dx, dy, surfaceId) => {
    const { measurements } = get();
    const past = [...get().past, [...measurements]].slice(-50);
    const adjusted = measurements.map((m) => {
      if (surfaceId !== undefined && m.surfaceId !== surfaceId) return m;
      if (m.type === 'annotation') {
        return {
          ...m,
          position: { x: m.position.x + dx, y: m.position.y + dy },
          ...(m.arrowTarget ? { arrowTarget: { x: m.arrowTarget.x + dx, y: m.arrowTarget.y + dy } } : {}),
        };
      }
      if (m.type === 'angle') {
        return {
          ...m,
          vertex: { x: m.vertex.x + dx, y: m.vertex.y + dy },
          armA: { x: m.armA.x + dx, y: m.armA.y + dy },
          armB: { x: m.armB.x + dx, y: m.armB.y + dy },
        };
      }
      if (m.type === 'area') {
        return {
          ...m,
          points: m.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          ...(m.center ? { center: { x: m.center.x + dx, y: m.center.y + dy } } : {}),
        };
      }
      // Model surface measurements are not affected by 2D coordinate adjustments
      if ((m as Measurement).surface === 'model') {
        return m;
      }
      return {
        ...m,
        start: { x: m.start.x + dx, y: m.start.y + dy },
        end: { x: m.end.x + dx, y: m.end.y + dy },
      };
    }) as AnyMeasurement[];
    set({ measurements: adjusted, past, future: [] });
  },
}));
