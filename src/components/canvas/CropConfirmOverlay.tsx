'use client';

import { RefObject } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/useUIStore';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { imageToScreen } from '@/lib/geometry';

interface CropConfirmOverlayProps {
  containerRef: RefObject<HTMLDivElement | null>;
}

export function CropConfirmOverlay({ containerRef }: CropConfirmOverlayProps) {
  const cropBounds = useUIStore((s) => s.cropBounds);
  const cropMode = useUIStore((s) => s.cropMode);
  const cancelCrop = useUIStore((s) => s.cancelCrop);
  const transform = useCanvasStore((s) => s.transform);

  if (!cropMode || !cropBounds) return null;

  // Position buttons below the crop selection in screen space
  const bottomRight = imageToScreen(
    cropBounds.x + cropBounds.w,
    cropBounds.y + cropBounds.h,
    transform
  );

  const handleApply = () => {
    const bounds = cropBounds;
    if (!bounds) return;
    useCanvasStore.getState().applyCrop(bounds);
    useUIStore.getState().cancelCrop();
    // Fit after a short delay to let the new image load
    setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      useCanvasStore.getState().fitImageToContainer(rect.width, rect.height);
    }, 100);
  };

  return (
    <div
      className="absolute z-20 flex gap-1"
      style={{
        left: `${bottomRight.x - 68}px`,
        top: `${bottomRight.y + 8}px`,
      }}
    >
      <Button
        size="sm"
        className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2"
        onClick={handleApply}
      >
        <Check className="h-3.5 w-3.5 mr-1" />
        Apply
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs px-2"
        onClick={cancelCrop}
      >
        <X className="h-3.5 w-3.5 mr-1" />
        Cancel
      </Button>
    </div>
  );
}
