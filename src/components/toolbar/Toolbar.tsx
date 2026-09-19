'use client';

import { useState, useEffect } from 'react';
import { Upload, HelpCircle, Save, FolderOpen, Trash2, FilePlus2, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModeButtons } from './ModeButtons';
import { ReferenceInput } from './ReferenceInput';
import { HistoryButtons } from './HistoryButtons';
import { ExportMenu } from './ExportMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useUIStore } from '@/stores/useUIStore';
import { useCanvasStore } from '@/stores/useCanvasStore';
import { useMeasurementStore } from '@/stores/useMeasurementStore';
import { useSceneObjectStore } from '@/stores/useSceneObjectStore';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { ProjectSummary } from '@/lib/project-storage';
import { useProjectStore } from '@/stores/useProjectStore';
import { useDocumentHistory, resetDocumentHistory } from '@/lib/document-history';
import { toast } from 'sonner';
import { confirmAction } from '@/components/dialogs/ConfirmActionDialog';

export function Toolbar() {
  const setHelpDialogOpen = useUIStore((s) => s.setHelpDialogOpen);
  const resetCanvas = useCanvasStore((s) => s.reset);
  const clearAll = useMeasurementStore((s) => s.clearAll);
  const hasContent = useSceneObjectStore((s) => s.objects.length > 0);
  const resetSceneObjects = useSceneObjectStore((s) => s.reset);
  const { saveProject, loadProject, listProjects, deleteProject, exportProject } = useLocalStorage();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const meta = useProjectStore();
  const revision = useDocumentHistory(s => s.revision);
  const dirty = meta.savedRevision !== revision;

  const run = async (action: () => Promise<unknown>) => {
    if (useProjectStore.getState().busy) return;
    useProjectStore.setState({ busy: true });
    try { await action(); } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The operation could not be completed.');
    } finally { useProjectStore.setState({ busy: false }); }
  };

  const refreshProjects = async () => {
    try { setProjects(await listProjects()); }
    catch { toast.error('Could not read saved projects. Browser storage may be unavailable.'); }
  };

  const handleSave = () => {
    const name = meta.name.trim() || 'Untitled project';
    if (name !== null) {
      void run(async () => {
        await saveProject(name || undefined);
        await refreshProjects();
        toast.success('Project saved, including source files');
      });
    }
  };

  const handleLoad = async (id: string) => {
    if (hasContent && dirty && !await confirmAction('Open another project? Unsaved changes will be replaced.')) return;
    void run(async () => { await loadProject(id); toast.success('Project opened'); });
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!await confirmAction('Delete this saved project?')) return;
    void run(async () => { await deleteProject(id); await refreshProjects(); });
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (hasContent) handleSave();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (hasContent && dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', unload); };
  });

  return (
    <div className="shrink-0 border-b border-border bg-card">
    <div className="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-2 text-xs">
      <input aria-label="Project name" value={meta.name} disabled={meta.busy} maxLength={120} className="w-48 rounded border border-transparent bg-transparent px-1 py-1 text-xs font-medium hover:border-border focus:border-border focus:outline-none" onChange={event => useProjectStore.setState({ name: event.target.value, savedRevision: -1 })} />
      <span role="status" className={dirty && hasContent ? 'text-amber-500' : 'text-muted-foreground'}>
        {meta.busy ? 'Working…' : !hasContent ? 'Local project' : dirty ? 'Unsaved changes' : 'Saved in this browser'}
      </span>
      <div className="flex-1" />
      <Button size="sm" variant="ghost" disabled={meta.busy} onClick={() => document.getElementById('projectFileInput')?.click()}>Open project file</Button>
      <Button size="sm" variant="ghost" disabled={meta.busy || !hasContent} onClick={() => void run(exportProject)}>Download project</Button>
      <input id="projectFileInput" type="file" accept=".measureit,.json" className="hidden" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || (hasContent && dirty && !await confirmAction('Replace unsaved work with this project?'))) return;
        void run(async () => { await loadProject('', JSON.parse(await file.text())); toast.success('Project imported'); });
      }} />
    </div>
    <header className="flex flex-wrap items-center gap-2 bg-card px-4 py-2 min-w-0 [&>button]:shrink-0">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-sm font-bold text-white">
          M
        </div>
        <span className="text-base font-semibold text-foreground">
          MeasureIt
        </span>
      </div>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('fileInput')?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Image
          </Button>
        </TooltipTrigger>
        <TooltipContent>Load an image</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('modelFileInput')?.click()}
          >
            <Box className="mr-1.5 h-4 w-4" />
            3D Model
          </Button>
        </TooltipTrigger>
        <TooltipContent>Load a 3D model (.glb, .stl)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasContent || meta.busy}
            onClick={async () => {
              if (await confirmAction('Start over? All objects and measurements will be removed.')) {
                clearAll();
                resetCanvas();
                resetSceneObjects();
                resetDocumentHistory();
                useProjectStore.setState({ id: null, name: 'Untitled project', savedAt: null, savedRevision: -1 });
              }
            }}
          >
            <FilePlus2 className="mr-1.5 h-4 w-4" />
            New
          </Button>
        </TooltipTrigger>
        <TooltipContent>Remove all objects and start over</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ModeButtons />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ReferenceInput />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <HistoryButtons />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={meta.busy || !hasContent}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save project to browser storage</TooltipContent>
        </Tooltip>

        <DropdownMenu onOpenChange={(open) => { if (open) refreshProjects(); }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={meta.busy}>
                  <FolderOpen className="mr-1.5 h-4 w-4" />
                  Load
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Load a saved project</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Saved Projects</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {projects.length === 0 ? (
              <DropdownMenuItem disabled>
                <span className="text-muted-foreground">No saved projects</span>
              </DropdownMenuItem>
            ) : (
              projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => handleLoad(p.id)}
                  className="flex items-center justify-between"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate text-sm">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.measurementCount} items &middot;{' '}
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className="ml-2 flex-shrink-0 rounded p-1 text-muted-foreground hover:text-rose-400"
                    onClick={(e) => handleDelete(e, p.id)}
                    aria-label={`Delete saved project ${p.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1" />

      <ExportMenu />

      <ThemeToggle />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setHelpDialogOpen(true)}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Help</TooltipContent>
      </Tooltip>
    </header>
    </div>
  );
}
