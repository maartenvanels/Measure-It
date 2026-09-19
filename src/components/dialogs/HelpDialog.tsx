'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/useUIStore';

export function HelpDialog() {
  const open = useUIStore((s) => s.helpDialogOpen);
  const setOpen = useUIStore((s) => s.setHelpDialogOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">How to use MeasureIt</DialogTitle>
        </DialogHeader>
        <ol className="mt-2 space-y-3 text-sm text-foreground/80">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
              1
            </span>
            <span>
              <strong className="text-foreground">Load an image</strong> — drag &
              drop, use the button, or paste from clipboard (Ctrl+V)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
              2
            </span>
            <span>
              <strong className="text-foreground">Draw a reference line</strong>{' '}
              — click Reference (or press R), then click the start and end of a known dimension
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
              3
            </span>
            <span>
              <strong className="text-foreground">Enter the real value</strong> —
              type the actual measurement (e.g. 50 mm) in the toolbar
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
              4
            </span>
            <span>
              <strong className="text-foreground">Measure anything</strong> —
              click Measure (or press M), then click a start and end point. Press Esc to cancel.
            </span>
          </li>
        </ol>
        <div className="mt-4 rounded-lg bg-card p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Pro tips:</strong> Press A to measure
          angles (click vertex, then two arm endpoints). Hold Shift for
          perfectly horizontal/vertical lines. Ctrl + scroll or Ctrl +/− to zoom, including while measuring. Middle-click to
          pan. Pinch to zoom on touch devices. Double-click a name to rename it.
        </div>
        <Button onClick={() => setOpen(false)} className="mt-2 w-full">
          Got it!
        </Button>
      </DialogContent>
    </Dialog>
  );
}
