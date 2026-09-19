'use client';

import { useMemo } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import type { AnyMeasurement, Measurement } from '@/types/measurement';
import { useUIStore } from '@/stores/useUIStore';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { SceneTreeNode } from './SceneTreeNode';

interface Props {
  groupKey: string;
  label: string;
  items: AnyMeasurement[];
}

export function SceneTreeGroup({ groupKey, label, items }: Props) {
  const collapsed = useUIStore((s) => s.collapsedGroups[groupKey] ?? false);
  const toggleCollapse = useUIStore((s) => s.toggleGroupCollapsed);
  const expandedCombines = useUIStore((s) => s.collapsedGroups);
  const setGroupVisibility = useMeasurementStore((s) => s.setGroupVisibility);

  // Build a tree: combined totals expand into their constituents. A constituent
  // is shown only under the FIRST total that references it (avoids duplicates).
  const tree = useMemo(() => {
    const totals = items.filter(
      (m): m is Measurement => m.type === 'measure' && !!(m as Measurement).combinedFrom,
    );
    const childrenByTotal = new Map<string, AnyMeasurement[]>();
    const claimed = new Set<string>();
    for (const t of totals) {
      const kids: AnyMeasurement[] = [];
      for (const childId of (t as Measurement).combinedFrom ?? []) {
        if (claimed.has(childId)) continue;
        const child = items.find((m) => m.id === childId);
        if (child) {
          kids.push(child);
          claimed.add(childId);
        }
      }
      childrenByTotal.set(t.id, kids);
    }
    const topLevel = items.filter((m) => !claimed.has(m.id));
    return { topLevel, childrenByTotal };
  }, [items]);

  if (items.length === 0) return null;

  const allVisible = items.every((m) => m.visible !== false);
  const noneVisible = items.every((m) => m.visible === false);

  const handleToggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation();
    const ids = items.map((m) => m.id);
    setGroupVisibility(ids, noneVisible);
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 px-1 rounded hover:bg-accent/50 text-xs cursor-pointer select-none"
        onClick={() => toggleCollapse(groupKey)}
      >
        <span className="p-0.5">
          {collapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </span>
        <span className="flex-1 truncate text-muted-foreground">
          {label} ({items.length})
        </span>
        <button
          onClick={handleToggleVisibility}
          className={`p-0.5 rounded ${noneVisible ? 'opacity-40' : 'opacity-60 hover:opacity-100'}`}
          title={noneVisible ? 'Show all' : 'Hide all'}
        >
          {noneVisible ? (
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Eye className={`h-3 w-3 text-muted-foreground ${!allVisible ? 'opacity-50' : ''}`} />
          )}
        </button>
      </div>
      {!collapsed && (
        <div className="ml-3">
          {tree.topLevel.map((m) => {
            const children = tree.childrenByTotal.get(m.id);
            if (children && children.length > 0) {
              const totalKey = `total-${m.id}`;
              const totalCollapsed = expandedCombines[totalKey] ?? false;
              return (
                <div key={m.id}>
                  <div className="flex items-stretch">
                    <button
                      onClick={() => toggleCollapse(totalKey)}
                      className="flex items-center px-0.5 hover:bg-accent/50 rounded"
                      title={totalCollapsed ? 'Expand constituents' : 'Collapse constituents'}
                    >
                      {totalCollapsed ? (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <SceneTreeNode measurement={m} />
                    </div>
                  </div>
                  {!totalCollapsed && (
                    <div className="ml-4 border-l border-border/40 pl-1">
                      {children.map((c) => (
                        <SceneTreeNode key={c.id} measurement={c} />
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return <SceneTreeNode key={m.id} measurement={m} />;
          })}
        </div>
      )}
    </div>
  );
}
