import { create } from 'zustand';
import { checkPowerOnSafety } from '../core/physics/evaluate';
import { drawSessionMeterGains } from '../core/physics/meters';
import type {
  ControlDef,
  ControlValue,
  ControlValues,
  MeterGains,
  TransformerLoadControls,
} from '../core/types';
import { useSessionStore } from './sessionStore';

interface ControlsState extends TransformerLoadControls {
  values: ControlValues;
  lampStates: boolean[];
  mcbTripped: boolean;
  focusedControl: string | null;
  isDraggingControl: boolean;
  gains: MeterGains;

  setControlValue: (id: string, value: ControlValue) => void;
  stepControlValue: (
    id: string,
    delta: number,
    min: number,
    max: number,
    precisionStep?: number,
  ) => void;
  cycleControlOption: (id: string, options: (number | string)[]) => void;

  setSupplyOn: (on: boolean) => void;
  toggleSupply: () => void;
  tripMcb: () => void;
  clearMcbTrip: () => void;
  setVariacV: (v: number, min?: number, max?: number, step?: number) => void;
  stepVariacV: (delta: number, min?: number, max?: number, step?: number) => void;
  setWmVRange: (vRange: 150 | 300) => void;
  setWmIRange: (iRange: 2.5 | 5 | 10) => void;
  cycleWmVRange: (options: number[]) => void;
  cycleWmIRange: (options: number[]) => void;
  setLamps: (lamps: number, max?: number) => void;
  toggleLampIndex: (index: number, controlId?: string) => void;
  setFocusedControl: (id: string | null) => void;
  setIsDraggingControl: (dragging: boolean) => void;
  initFromControls: (
    controls: ControlDef[],
    seed?: number,
    meterIds?: string[],
  ) => void;
  resetControls: (seed?: number) => void;
}

function createFreshSeed(): number {
  return Math.floor(Date.now() % 2147483647) || 1337;
}

function makeLampArray(count: number, max = 12): boolean[] {
  return Array.from({ length: max }, (_, i) => i < count);
}

function quantizeValue(val: number, min: number, max: number, step?: number): number {
  const clamped = Math.max(min, Math.min(max, val));
  if (!step || step >= 1) {
    return Math.round(clamped * 10) / 10 === Math.round(clamped)
      ? Math.round(clamped)
      : Math.round(clamped * 10) / 10;
  }
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

function syncLegacyFromValues(
  values: ControlValues,
  prevState: Pick<
    ControlsState,
    'supplyOn' | 'variacV' | 'wmVRange' | 'wmIRange' | 'lamps' | 'lampStates'
  >,
): Pick<
  ControlsState,
  'supplyOn' | 'variacV' | 'wmVRange' | 'wmIRange' | 'lamps' | 'lampStates'
> {
  const supplyOn =
    'sup3.switch' in values
      ? Boolean(values['sup3.switch'])
      : 'sup.switch' in values
        ? Boolean(values['sup.switch'])
        : prevState.supplyOn;
  const variacV =
    'va3.knob' in values
      ? Number(values['va3.knob'])
      : 'va.knob' in values
        ? Number(values['va.knob'])
        : prevState.variacV;
  const rawV = Number(values['wm.vRange'] ?? prevState.wmVRange);
  const wmVRange: 150 | 300 = rawV === 150 ? 150 : 300;
  const rawI = Number(values['wm.iRange'] ?? prevState.wmIRange);
  const wmIRange: 2.5 | 5 | 10 = rawI === 2.5 ? 2.5 : rawI === 5 ? 5 : 10;
  const lamps = 'ld.lamps' in values ? Number(values['ld.lamps']) : prevState.lamps;
  const lampStates =
    'ld.lamps' in values
      ? makeLampArray(lamps, prevState.lampStates.length || 12)
      : prevState.lampStates;

  return { supplyOn, variacV, wmVRange, wmIRange, lamps, lampStates };
}

export const useControlsStore = create<ControlsState>((set, get) => ({
  values: {
    'sup.switch': false,
    'va.knob': 0,
    'wm.vRange': 300,
    'wm.iRange': 10,
    'ld.lamps': 0,
  },
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

  setControlValue: (id, value) => {
    const state = get();
    if ((id === 'sup.switch' || id === 'sup3.switch') && value === true) {
      const knobEntries = Object.entries(state.values).filter(([k]) =>
        k.endsWith('.knob'),
      );
      const knobVal =
        knobEntries.length > 0
          ? Math.max(0, ...knobEntries.map(([, v]) => Number(v) || 0))
          : Number(state.variacV ?? 0);
      const warn = checkPowerOnSafety(knobVal);
      if (warn) {
        useSessionStore.getState().pushToast(warn);
      }
    }
    const nextValues = { ...state.values, [id]: value };
    const synced = syncLegacyFromValues(nextValues, state);
    set({
      values: nextValues,
      ...synced,
      ...(id.endsWith('.switch') && value === true ? { mcbTripped: false } : {}),
    });
  },

  stepControlValue: (id, delta, min, max, precisionStep) => {
    const state = get();
    const cur = Number(state.values[id] ?? 0);
    const effectiveStep = precisionStep ?? (Math.abs(delta) < 1 ? Math.abs(delta) : undefined);
    const next = quantizeValue(cur + delta, min, max, effectiveStep);
    const nextValues = { ...state.values, [id]: next };
    const synced = syncLegacyFromValues(nextValues, state);
    set({ values: nextValues, ...synced });
  },

  cycleControlOption: (id, options) => {
    if (options.length === 0) return;
    const state = get();
    const current = state.values[id];
    const idx = options.indexOf(current as number | string);
    const next = options[(idx + 1) % options.length];
    const nextValues = { ...state.values, [id]: next };
    const synced = syncLegacyFromValues(nextValues, state);
    set({ values: nextValues, ...synced });
  },

  setSupplyOn: (supplyOn) => {
    const swId = 'sup3.switch' in get().values ? 'sup3.switch' : 'sup.switch';
    get().setControlValue(swId, supplyOn);
  },

  toggleSupply: () => {
    const next = !get().supplyOn;
    get().setSupplyOn(next);
  },

  tripMcb: () =>
    set((state) => {
      const swId = 'sup3.switch' in state.values ? 'sup3.switch' : 'sup.switch';
      return {
        supplyOn: false,
        mcbTripped: true,
        values: { ...state.values, [swId]: false },
      };
    }),

  clearMcbTrip: () => set({ mcbTripped: false }),

  setVariacV: (v, min = 0, max = 270, step) => {
    const next = quantizeValue(v, min, max, step);
    set((state) => ({
      variacV: next,
      values: { ...state.values, 'va.knob': next },
    }));
  },

  stepVariacV: (delta, min = 0, max = 270, step) => {
    const effectiveStep = step ?? (Math.abs(delta) < 1 ? Math.abs(delta) : undefined);
    set((state) => {
      const next = quantizeValue(state.variacV + delta, min, max, effectiveStep);
      return {
        variacV: next,
        values: { ...state.values, 'va.knob': next },
      };
    });
  },

  setWmVRange: (wmVRange) =>
    set((state) => ({
      wmVRange,
      values: { ...state.values, 'wm.vRange': wmVRange },
    })),

  setWmIRange: (wmIRange) =>
    set((state) => ({
      wmIRange,
      values: { ...state.values, 'wm.iRange': wmIRange },
    })),

  cycleWmVRange: (options) => {
    if (options.length === 0) return;
    const current = get().wmVRange;
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    if (next === 150 || next === 300) {
      get().setWmVRange(next);
    }
  },

  cycleWmIRange: (options) => {
    if (options.length === 0) return;
    const current = get().wmIRange;
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    if (next === 2.5 || next === 5 || next === 10) {
      get().setWmIRange(next);
    }
  },

  setLamps: (count, max = get().lampStates.length || 12) => {
    const clamped = Math.max(0, Math.min(max, Math.round(count)));
    set((state) => ({
      lamps: clamped,
      lampStates: makeLampArray(clamped, max),
      values: { ...state.values, 'ld.lamps': clamped },
    }));
  },

  toggleLampIndex: (index, controlId = 'ld.lamps') =>
    set((state) => {
      if (index < 0 || index >= state.lampStates.length) return state;
      const nextStates = [...state.lampStates];
      nextStates[index] = !nextStates[index];
      const count = nextStates.filter(Boolean).length;
      return {
        lampStates: nextStates,
        lamps: count,
        values: { ...state.values, [controlId]: count },
      };
    }),

  setFocusedControl: (focusedControl) => set({ focusedControl }),

  setIsDraggingControl: (isDraggingControl) => set({ isDraggingControl }),

  initFromControls: (controls, seed, meterIds) => {
    const values: ControlValues = {};
    for (const ctrl of controls) {
      values[ctrl.id] = ctrl.defaultValue;
    }

    const sw = controls.find((c) => c.id === 'sup.switch' || c.id === 'sup3.switch');
    const knob = controls.find((c) => c.id === 'va.knob' || c.id === 'va3.knob');
    const vSel = controls.find((c) => c.id === 'wm.vRange');
    const iSel = controls.find((c) => c.id === 'wm.iRange');
    const steps = controls.find((c) => c.kind === 'steps');

    const maxLamps = steps?.kind === 'steps' ? steps.max : 12;
    const defaultLamps = steps?.kind === 'steps' ? steps.defaultValue : 0;
    const resolvedSeed = seed ?? useSessionStore.getState().sessionSeed ?? createFreshSeed();

    set({
      values,
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
      gains: drawSessionMeterGains(resolvedSeed, meterIds),
    });
  },

  resetControls: (seed) =>
    set((state) => {
      const resolvedSeed = seed ?? useSessionStore.getState().sessionSeed ?? createFreshSeed();
      return {
        values: {
          'sup.switch': false,
          'va.knob': 0,
          'wm.vRange': 300,
          'wm.iRange': 10,
          'ld.lamps': 0,
        },
        supplyOn: false,
        variacV: 0,
        wmVRange: 300,
        wmIRange: 10,
        lamps: 0,
        lampStates: makeLampArray(0, state.lampStates.length || 12),
        mcbTripped: false,
        focusedControl: null,
        isDraggingControl: false,
        gains: drawSessionMeterGains(resolvedSeed),
      };
    }),
}));
