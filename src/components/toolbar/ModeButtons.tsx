'use client';

import { Ruler, PenLine, TriangleRight, Hexagon, StickyNote, Crop, Grid3x3, ChevronDown, Box, Pencil, Circle, CircleDot, Move, RotateCcw, Maximize, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/stores/useUIStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { ToolGroupButton, type ToolOption } from './ToolGroupButton';
import { DrawMode, isMeasureMode } from '@/types/measurement';

const AREA_TOOLS: ToolOption[] = [
  { mode: 'area-polygon', label: 'Polygon', icon: Hexagon, shortcut: 'P' },
  { mode: 'area-freehand', label: 'Freehand', icon: Pencil },
  { mode: 'area-circle-3pt', label: 'Circle (3pt)', icon: Circle },
  { mode: 'area-circle-center', label: 'Circle (center)', icon: CircleDot },
];

const MEASURE_TOOLS: ToolOption[] = [
  { mode: 'measure', label: 'Measure', icon: PenLine, shortcut: 'M' },
  { mode: 'measure-chain', label: 'Chain', icon: Link2 },
];

const GRID_PRESETS = [10, 25, 50, 100, 200, 500];

export function ModeButtons() {
  const mode = useUIStore((s) => s.mode);
  const toggleMode = useUIStore((s) => s.toggleMode);
  const setMode = useUIStore((s) => s.setMode);
  const lastAreaTool = useUIStore((s) => s.lastAreaTool);
  const lastMeasureTool = useUIStore((s) => s.lastMeasureTool);
  const cropMode = useUIStore((s) => s.cropMode);
  const setCropMode = useUIStore((s) => s.setCropMode);
  const gridEnabled = useUIStore((s) => s.gridEnabled);
  const gridSpacing = useUIStore((s) => s.gridSpacing);
  const toggleGrid = useUIStore((s) => s.toggleGrid);
  const setGridSpacing = useUIStore((s) => s.setGridSpacing);

  const sceneObjects = useSceneObjectStore((s) => s.objects);
  const selectedObjectId = useSceneObjectStore((s) => s.selectedObjectId);
  const transformMode = useSceneObjectStore((s) => s.transformMode);
  const setTransformMode = useSceneObjectStore((s) => s.setTransformMode);

  // Auto-detect 3D mode from scene contents
  const is3D = sceneObjects.some((o) => o.type === 'model');
  const hasTarget = sceneObjects.length > 0;
  const hasImages = sceneObjects.some((o) => o.type === 'image');

  return (
    <div className="flex items-center gap-1">
      {/* Reference & Measure (unified for 2D and 3D) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={mode === 'reference' ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleMode('reference')}
            disabled={!hasTarget}
            className={mode === 'reference' ? 'bg-rose-600 hover:bg-rose-700 text-white' : ''}
          >
            {is3D ? <Box className="mr-1.5 h-4 w-4" /> : <Ruler className="mr-1.5 h-4 w-4" />}
            Reference
          </Button>
        </TooltipTrigger>
        <TooltipContent>{is3D ? 'Set reference on 3D model' : 'Draw a reference line (R)'}</TooltipContent>
      </Tooltip>
      {is3D ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={mode === 'measure' ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleMode('measure')}
              disabled={!hasTarget}
              className={mode === 'measure' ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : ''}
            >
              <Ruler className="mr-1.5 h-4 w-4" />
              Measure
            </Button>
          </TooltipTrigger>
          <TooltipContent>Measure distance on 3D model</TooltipContent>
        </Tooltip>
      ) : (
        <ToolGroupButton
          tools={MEASURE_TOOLS}
          activeMode={mode}
          lastUsedMode={lastMeasureTool}
          onSelect={(m: DrawMode) => {
            if (m === 'none') {
              setMode('none');
            } else {
              toggleMode(m);
            }
          }}
          disabled={!hasTarget}
          activeClassName="bg-cyan-600 hover:bg-cyan-700 text-white"
          tooltip="Draw measurement (M) — Chain: click points in sequence, Esc to end"
          isActivePredicate={isMeasureMode}
          dropdownTooltip="Measure tools"
        />
      )}

      {/* 2D-only tools */}
      {!is3D && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={mode === 'angle' ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleMode('angle')}
                disabled={!hasImages}
                className={mode === 'angle' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
              >
                <TriangleRight className="mr-1.5 h-4 w-4" />
                Angle
              </Button>
            </TooltipTrigger>
            <TooltipContent>Measure an angle (A)</TooltipContent>
          </Tooltip>
          <ToolGroupButton
            tools={AREA_TOOLS}
            activeMode={mode}
            lastUsedMode={lastAreaTool}
            onSelect={(m: DrawMode) => {
              if (m === 'none') {
                setMode('none');
              } else {
                toggleMode(m);
              }
            }}
            disabled={!hasImages}
            activeClassName="bg-emerald-600 hover:bg-emerald-700 text-white"
            tooltip="Measure an area (P)"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={mode === 'annotation' ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleMode('annotation')}
                disabled={!hasImages}
                className={mode === 'annotation' ? 'bg-violet-600 hover:bg-violet-700 text-white' : ''}
              >
                <StickyNote className="mr-1.5 h-4 w-4" />
                Annotate
              </Button>
            </TooltipTrigger>
            <TooltipContent>Place a text annotation (T)</TooltipContent>
          </Tooltip>
        </>
      )}
      {!is3D && (
        <>
          <div className="mx-1 h-6 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={cropMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCropMode(!cropMode)}
                disabled={!hasImages}
                className={cropMode ? 'bg-orange-600 hover:bg-orange-700 text-white' : ''}
              >
                <Crop className="mr-1.5 h-4 w-4" />
                Crop
              </Button>
            </TooltipTrigger>
            <TooltipContent>Crop the image (C)</TooltipContent>
          </Tooltip>
        </>
      )}
      {!is3D && (
        <>
          <div className="mx-1 h-6 w-px bg-border" />
          <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={gridEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={toggleGrid}
              disabled={!hasImages}
              className={`rounded-r-none ${gridEnabled ? 'bg-muted hover:bg-accent text-white' : ''}`}
            >
              <Grid3x3 className="mr-1.5 h-4 w-4" />
              Grid
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle grid overlay (G)</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={gridEnabled ? 'default' : 'outline'}
                  size="sm"
                  disabled={!hasImages}
                  className={`rounded-l-none border-l-0 px-1.5 ${gridEnabled ? 'bg-muted hover:bg-accent text-white' : ''}`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Grid spacing</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Grid spacing (px)</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={String(gridSpacing)}
              onValueChange={(v) => setGridSpacing(Number(v))}
            >
              {GRID_PRESETS.map((size) => (
                <DropdownMenuRadioItem key={size} value={String(size)}>
                  {size}px
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
        </>
      )}

      {/* Transform mode buttons — visible when an object is selected */}
      {selectedObjectId && (
        <>
          <div className="mx-1 h-6 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={transformMode === 'translate' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTransformMode('translate')}
                className={transformMode === 'translate' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
              >
                <Move className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move object (T)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={transformMode === 'rotate' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTransformMode('rotate')}
                className={transformMode === 'rotate' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rotate object (R)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={transformMode === 'scale' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTransformMode('scale')}
                className={transformMode === 'scale' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scale object (S)</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );
}
