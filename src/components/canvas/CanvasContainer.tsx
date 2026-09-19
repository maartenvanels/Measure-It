'use client';

import { useRef, useCallback, useEffect, Suspense } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { useImageLoader } from '@/hooks/useImageLoader';
import { use3DModelLoader, isModelFile } from '@/hooks/use3DModelLoader';
import { DropZone } from './DropZone';
import dynamic from 'next/dynamic';

const UnifiedScene = dynamic(
  () => import('@/components/scene/UnifiedScene').then((module) => module.UnifiedScene),
  { ssr: false, loading: () => <div className="p-6 text-sm text-muted-foreground">Loading viewer…</div> },
);

export function CanvasContainer() {
  const containerRef = useRef<HTMLDivElement>(null);

  const hasContent = useSceneObjectStore((s) => s.objects.length > 0);
  const hasModels = useSceneObjectStore((s) => s.objects.some((o) => o.type === 'model'));
  const mode = useUIStore((s) => s.mode);
  const cropMode = useUIStore((s) => s.cropMode);

  const { loadFromFile, loadFromDrop, loadFromClipboard } = useImageLoader();
  const { loadFromFile: loadModelFromFile } = use3DModelLoader();

  // Clipboard paste
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      loadFromClipboard(e, rect.width, rect.height);
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [loadFromClipboard]);

  // Drag and drop — handle both images and 3D models
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (!files.length) return;

      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (isModelFile(file)) {
          loadModelFromFile(file);
        } else if (file.type.startsWith('image/') && rect) {
          loadFromFile(file, rect.width, rect.height);
        }
      }
    },
    [loadFromFile, loadModelFromFile]
  );

  // File input handler for images (called from toolbar)
  useEffect(() => {
    const handler = (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      loadFromFile(file, rect.width, rect.height);
      input.value = '';
    };

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.addEventListener('change', handler);
    return () => {
      if (fileInput) fileInput.removeEventListener('change', handler);
    };
  }, [loadFromFile]);

  // File input handler for 3D models (called from toolbar)
  useEffect(() => {
    const handler = (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      loadModelFromFile(file);
      input.value = '';
    };

    const fileInput = document.getElementById('modelFileInput');
    if (fileInput) fileInput.addEventListener('change', handler);
    return () => {
      if (fileInput) fileInput.removeEventListener('change', handler);
    };
  }, [loadModelFromFile]);

  const cursorClass = hasModels ? '' :
    cropMode ? 'cursor-crosshair' :
    mode === 'none' ? 'cursor-grab' :
    mode === 'annotation' ? 'cursor-text' : 'cursor-crosshair';

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 overflow-hidden bg-background ${cursorClass}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Unified Three.js scene for both 2D images and 3D models */}
      {hasContent && (
        <Suspense fallback={
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            Loading viewer...
          </div>
        }>
          <UnifiedScene />
        </Suspense>
      )}

      {!hasContent && <DropZone containerRef={containerRef} />}
      <input type="file" id="fileInput" accept="image/*" className="hidden" />
      <input type="file" id="modelFileInput" accept=".glb,.gltf,.stl" className="hidden" />
    </div>
  );
}
