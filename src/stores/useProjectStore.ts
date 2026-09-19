import { create } from 'zustand';
export const useProjectStore = create<{
  id: string | null; name: string; busy: boolean; savedAt: number | null; savedRevision: number;
}>(() => ({ id: null, name: 'Untitled project', busy: false, savedAt: null, savedRevision: -1 }));
