'use client';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';

export function SourceTransform({ sourceId, children }: { sourceId?: string; children: React.ReactNode }) {
  const source = useSceneObjectStore(s => s.objects.find(o => o.id === sourceId));
  if (sourceId && (!source || !source.visible)) return null;
  if (!source) return <>{children}</>;
  return <group position={source.transform.position} rotation={source.transform.rotation} scale={source.transform.scale}>{children}</group>;
}
