import { create } from 'zustand';

interface InterfaceState {
  readonly reducedMotion: boolean;
  readonly toggleReducedMotion: () => void;
}

export const useInterfaceStore = create<InterfaceState>((set) => ({
  reducedMotion: false,
  toggleReducedMotion: () =>
    set((state) => ({ reducedMotion: !state.reducedMotion })),
}));
