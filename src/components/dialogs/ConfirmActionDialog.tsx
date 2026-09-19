'use client';
import { create } from 'zustand';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const useConfirmation = create<{ pending: { message: string; resolve: (answer: boolean) => void } | null }>(() => ({ pending: null }));
export function confirmAction(message: string): Promise<boolean> {
  useConfirmation.getState().pending?.resolve(false);
  return new Promise(resolve => useConfirmation.setState({ pending: { message, resolve } }));
}
export function ConfirmActionDialog() {
  const pending = useConfirmation(s => s.pending);
  const answer = (value: boolean) => { useConfirmation.setState({ pending: null }); pending?.resolve(value); };
  return <Dialog open={!!pending} onOpenChange={open => { if (!open) answer(false); }}>
    <DialogContent><DialogHeader><DialogTitle>Confirm action</DialogTitle><DialogDescription>{pending?.message}</DialogDescription></DialogHeader>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => answer(false)}>Cancel</Button><Button onClick={() => answer(true)}>Continue</Button></div>
    </DialogContent>
  </Dialog>;
}
