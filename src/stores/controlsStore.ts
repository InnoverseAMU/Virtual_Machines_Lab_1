import { create } from 'zustand';
import { checkPowerOnSafety } from '../core/physics/evaluate';
import { drawSessionMeterGains } from '../core/physics/meters';
import type {
  ControlDef,
  MeterGains,
  TransformerLoadControls,
} from '../core/types';
import { useSessionStore } from './sessionStore';

interface ControlsState extends TransformerLoadControls {
  lampStates: boolean[];
  mcbTripped: boolean;
  focusedControl: string | null;
  isDraggingControl: boolean;
  gains: MeterGains;

  setSupplyOn: (on: boolean) => void;
  toggleSupply: () => void;
  tripMcb: () => void;
  clearMcbTrip: () => void;
  setVariacV: (v: number, min?: number, max?: number) => void;
  stepVariacV: (delta: number, min?: number, max?: number) => void;
  setWmVRange: (vRange: 150 | 300) => void;
  setWmIRange: (iRange: 2.5 | 5 | 10) => void;
  cycleWmVRange: (options: number[]) => void;
  cycleWmIRange: (options: number[]) => void;
  setLamps: (lamps: number, max?: number) => void;
  toggleLampIndex: (index: number) => void;
  setFocusedControl: (id: string | null) => void;
  setIsDraggingControl: (dragging: boolean) => void;
  initFromControls: (controls: ControlDef[]) => void;
  resetControls: () => void;
}

function createFreshSeed(): number {
  return Math.floor(Date.now() % 2147483647) || 1337;
}

function makeLampArray(count: number, max = 12): boolean[] {
  return Array.from({ length: max }, (_, i) => i < count);
}

export const useControlsStore = create<ControlsState>((set, get) => ({
  supplyOn: false,
  variacV: 0,
  wmVRange: 300,
  wmIRange: 10,
  lamps: 0,
  lampStates: makeLampArray(0, 12),
  mcbTripped: false,
  focusedControl: null,
  isDraggingControl: false,
  gains: drawSessionMeterGains(createFreshSeed()),

  setSupplyOn: (supplyOn) => {
    if (supplyOn) {
      const warn = checkPowerOnSafety(get().variacV);
      if (warn) {
        useSessionStore.getState().pushToast(warn);
      }
      set({ supplyOn: true, mcbTripped: false });
    } else {
      set({ supplyOn: false });
    }
  },

  toggleSupply: () => {
    const next = !get().supplyOn;
    get().setSupplyOn(next);
  },

  tripMcb: () => set({ supplyOn: false, mcbTripped: true }),

  clearMcbTrip: () => set({ mcbTripped: false }),

  setVariacV: (v, min = 0, max = 270) =>
    set({
      variacV: Math.max(min, Math.min(max, Math.round(v))),
    }),

  stepVariacV: (delta, min = 0, max = 270) =>
    set((state) => ({
      variacV: Math.max(min, Math.min(max, Math.round(state.variacV + delta))),
    })),

  setWmVRange: (wmVRange) => set({ wmVRange }),

  setWmIRange: (wmIRange) => set({ wmIRange }),

  cycleWmVRange: (options) => {
    if (options.length === 0) return;
    const current = get().wmVRange;
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    if (next === 150 || next === 300) {
      set({ wmVRange: next });
    }
  },

  cycleWmIRange: (options) => {
    if (options.length === 0) return;
    const current = get().wmIRange;
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    if (next === 2.5 || next === 5 || next === 10) {
      set({ wmIRange: next });
    }
  },

  setLamps: (count, max = get().lampStates.length || 12) => {
    const clamped = Math.max(0, Math.min(max, Math.round(count)));
    set({
      lamps: clamped,
      lampStates: makeLampArray(clamped, max),
    });
  },

  toggleLampIndex: (index) =>
    set((state) => {
      if (index < 0 || index >= state.lampStates.length) return state;
      const nextStates = [...state.lampStates];
      nextStates[index] = !nextStates[index];
      const count = nextStates.filter(Boolean).length;
      return {
        lampStates: nextStates,
        lamps: count,
      };
    }),

  setFocusedControl: (focusedControl) => set({ focusedControl }),

  setIsDraggingControl: (isDraggingControl) => set({ isDraggingControl }),

  initFromControls: (controls) => {
    const sw = controls.find((c) => c.id === 'sup.switch');
    const knob = controls.find((c) => c.id === 'va.knob');
    const vSel = controls.find((c) => c.id === 'wm.vRange');
    const iSel = controls.find((c) => c.id === 'wm.iRange');
    const steps = controls.find((c) => c.id === 'ld.lamps');

    const maxLamps = steps?.kind === 'steps' ? steps.max : 12;
    const defaultLamps = steps?.kind === 'steps' ? steps.defaultValue : 0;

    set({
      supplyOn: sw?.kind === 'switch' ? sw.defaultValue : false,
      variacV: knob?.kind === 'knob' ? knob.defaultValue : 0,
      wmVRange:
        vSel?.kind === 'selector' &&
        (vSel.defaultValue === 150 || vSel.defaultValue === 300)
          ? vSel.defaultValue
          : 300,
      wmIRange:
        iSel?.kind === 'selector' &&
        (iSel.defaultValue === 2.5 ||
          iSel.defaultValue === 5 ||
          iSel.defaultValue === 10)
          ? iSel.defaultValue
          : 10,
      lamps: defaultLamps,
      lampStates: makeLampArray(defaultLamps, maxLamps),
      mcbTripped: false,
      focusedControl: null,
      isDraggingControl: false,
      gains: drawSessionMeterGains(createFreshSeed()),
    });
  },

  resetControls: () =>
    set((state) => ({
      supplyOn: false,
      variacV: 0,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 0,
      lampStates: makeLampArray(0, state.lampStates.length || 12),
      mcbTripped: false,
      focusedControl: null,
      isDraggingControl: false,
      gains: drawSessionMeterGains(createFreshSeed()),
    })),
}));
