import { create } from 'zustand';

interface UiState {
  connectOpen: boolean;
  /** Increments to trigger a celebratory petal shower. */
  celebrate: number;
  openConnect: () => void;
  closeConnect: () => void;
  fireCelebrate: () => void;
}

export const useUi = create<UiState>()((set) => ({
  connectOpen: false,
  celebrate: 0,
  openConnect: () => set({ connectOpen: true }),
  closeConnect: () => set({ connectOpen: false }),
  fireCelebrate: () => set((s) => ({ celebrate: s.celebrate + 1 })),
}));
