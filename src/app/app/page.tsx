'use client';

import { Toolbar } from '@/components/toolbar/Toolbar';
import { SelectedMeasurementBar } from '@/components/toolbar/SelectedMeasurementBar';
import { CanvasContainer } from '@/components/canvas/CanvasContainer';
import { MeasurementsSidebar } from '@/components/sidebar/MeasurementsSidebar';
import { SidebarResizeHandle } from '@/components/sidebar/SidebarResizeHandle';
import { StatusBar } from '@/components/StatusBar';
import { HelpDialog } from '@/components/dialogs/HelpDialog';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';
import { AnnotationEditorDialog } from '@/components/dialogs/AnnotationEditorDialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useProjectStore } from '@/stores/useProjectStore';
import { ConfirmActionDialog } from '@/components/dialogs/ConfirmActionDialog';

export default function AppPage() {
  useKeyboardShortcuts();
  const busy = useProjectStore(s => s.busy);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background">
      <Toolbar />
      <SelectedMeasurementBar />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {busy && <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 text-sm">Preparing project…</div>}
        <CanvasContainer />
        <SidebarResizeHandle />
        <MeasurementsSidebar />
      </div>
      <StatusBar />
      <HelpDialog />
      <SettingsDialog />
      <AnnotationEditorDialog />
      <ConfirmActionDialog />
    </div>
  );
}
