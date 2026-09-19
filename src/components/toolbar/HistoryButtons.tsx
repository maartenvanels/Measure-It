'use client';

import { Undo2, Redo2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useDocumentHistory, undoDocument, redoDocument } from '@/lib/document-history';

export function HistoryButtons() {
  const past = useDocumentHistory((s) => s.past);
  const future = useDocumentHistory((s) => s.future);
  const measurements = useMeasurementStore((s) => s.measurements);
  const undo = undoDocument;
  const redo = redoDocument;
  const clearAll = useMeasurementStore((s) => s.clearAll);

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={undo}
            aria-label="Undo"
            disabled={past.length === 0}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={redo}
            aria-label="Redo"
            disabled={future.length === 0}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={clearAll}
            disabled={measurements.length === 0}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Clear all measurements</TooltipContent>
      </Tooltip>
    </div>
  );
}
