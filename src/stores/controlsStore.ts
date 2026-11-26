import { create } from 'zustand';
import { drawSessionMeterGains } from '../core/physics/meters';
import type { MeterGains, TransformerLoadControls } from '../core/types';

interface ControlsState extends TransformerLoadControls {
  gains: MeterGains;
  setSupplyOn: (on: boolean) => void;
  setVariacV: (v: number) => void;
  setWmVRange: (vRange: 150 | 300) => void;
  setWmIRange: (iRange: 2.5 | 5 | 10) => void;
  setLamps: (lamps: number) => void;
  toggleLamp: (index: number) => void;
  resetControls: () => void;
}

function createFreshSeed(): number {
  return Math.floor(Date.now() % 2147483647) || 1337;
}

export const useControlsStore = create<ControlsState>((set) => ({
  supplyOn: false,
  variacV: 0,
  wmVRange: 300,
  wmIRange: 10,
  lamps: 0,
  gains: drawSessionMeterGains(createFreshSeed()),

  setSupplyOn: (supplyOn) => set({ supplyOn }),

  setVariacV: (v) =>
    set({
      variacV: Math.max(0, Math.min(270, Math.round(v))),
    }),

  setWmVRange: (wmVRange) => set({ wmVRange }),

  setWmIRange: (wmIRange) => set({ wmIRange }),

  setLamps: (lamps) =>
    set({
      lamps: Math.max(0, Math.min(12, Math.round(lamps))),
    }),

  toggleLamp: (index) =>
    set((state) => {
      // Lamps step 0..12; clicking lamp k sets count to k if currently < k, else k - 1
      const target = state.lamps >= index ? index - 1 : index;
      return { lamps: Math.max(0, Math.min(12, target)) };
    }),

  resetControls: () =>
    set({
      supplyOn: false,
      variacV: 0,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 0,
      gains: drawSessionMeterGains(createFreshSeed()),
    }),
}));
