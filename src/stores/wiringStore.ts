import { create } from 'zustand';
import { canModifyWiring } from '../core/circuit/validate';
import type { TerminalId, Wire, WireEndpointPair } from '../core/types';
import { useControlsStore } from './controlsStore';
import { useSessionStore } from './sessionStore';

interface WiringState {
  wires: Wire[];
  selectedTerminal: TerminalId | null;
  hoveredTerminal: TerminalId | null;

  setHoveredTerminal: (id: TerminalId | null) => void;
  clearSelectedTerminal: () => void;
  clickTerminal: (id: TerminalId, supplyOn: boolean) => void;
  removeWire: (wireId: string, supplyOn: boolean) => void;
  clearAllWires: (supplyOn: boolean) => void;
  setSolutionWires: (pairs: WireEndpointPair[]) => void;

  // Scripted Learn-mode helpers (bypass manual wiring lock for scripted steps only)
  addTutorialWire: (a: TerminalId, b: TerminalId, stepIndex: number) => void;
  removeTutorialWiresFromStep: (minStepIndex: number) => void;
  clearAllWiresScripted: () => void;
}

let wireCounter = 0;

function makeWireId(a: TerminalId, b: TerminalId): string {
  wireCounter += 1;
  return `w_${wireCounter}_${a}_${b}`;
}

export const useWiringStore = create<WiringState>((set, get) => ({
  wires: [],
  selectedTerminal: null,
  hoveredTerminal: null,

  setHoveredTerminal: (hoveredTerminal) => set({ hoveredTerminal }),

  clearSelectedTerminal: () => set({ selectedTerminal: null }),

  clickTerminal: (id, supplyOn) => {
    // Manual wiring is disabled in Learn mode
    if (useSessionStore.getState().mode === 'learn') return;

    const check = canModifyWiring(supplyOn);
    if (!check.allowed) {
      useSessionStore.getState().pushToast({
        id: 'wiring-blocked',
        severity: 'danger',
        message: check.message,
      });
      set({ selectedTerminal: null });
      return;
    }

    const { selectedTerminal, wires } = get();
    if (selectedTerminal === null) {
      set({ selectedTerminal: id });
      return;
    }

    if (selectedTerminal === id) {
      set({ selectedTerminal: null });
      return;
    }

    const duplicate = wires.some(
      (w) =>
        (w.a === selectedTerminal && w.b === id) ||
        (w.a === id && w.b === selectedTerminal),
    );
    if (duplicate) {
      set({ selectedTerminal: null });
      return;
    }

    const newWire: Wire = {
      id: makeWireId(selectedTerminal, id),
      a: selectedTerminal,
      b: id,
    };

    useControlsStore.getState().clearMcbTrip();
    set({
      wires: [...wires, newWire],
      selectedTerminal: null,
    });
  },

  removeWire: (wireId, supplyOn) => {
    if (useSessionStore.getState().mode === 'learn') return;

    const check = canModifyWiring(supplyOn);
    if (!check.allowed) {
      useSessionStore.getState().pushToast({
        id: 'wiring-blocked',
        severity: 'danger',
        message: check.message,
      });
      return;
    }

    useControlsStore.getState().clearMcbTrip();
    set((state) => ({
      wires: state.wires.filter((w) => w.id !== wireId),
    }));
  },

  clearAllWires: (supplyOn) => {
    const check = canModifyWiring(supplyOn);
    if (!check.allowed) {
      useSessionStore.getState().pushToast({
        id: 'wiring-blocked',
        severity: 'danger',
        message: check.message,
      });
      return;
    }
    useControlsStore.getState().clearMcbTrip();
    set({ wires: [], selectedTerminal: null });
  },

  setSolutionWires: (pairs) => {
    useControlsStore.getState().clearMcbTrip();
    set({
      wires: pairs.map(([a, b]) => ({
        id: makeWireId(a, b),
        a,
        b,
      })),
      selectedTerminal: null,
    });
  },

  addTutorialWire: (a, b, stepIndex) => {
    const { wires } = get();
    const exists = wires.some(
      (w) => (w.a === a && w.b === b) || (w.a === b && w.b === a),
    );
    if (exists) return;

    useControlsStore.getState().clearMcbTrip();
    set({
      wires: [
        ...wires,
        {
          id: makeWireId(a, b),
          a,
          b,
          tutorialStep: stepIndex,
        },
      ],
      selectedTerminal: null,
    });
  },

  removeTutorialWiresFromStep: (minStepIndex) => {
    useControlsStore.getState().clearMcbTrip();
    set((state) => ({
      wires: state.wires.filter(
        (w) => w.tutorialStep === undefined || w.tutorialStep < minStepIndex,
      ),
      selectedTerminal: null,
    }));
  },

  clearAllWiresScripted: () => {
    useControlsStore.getState().clearMcbTrip();
    set({ wires: [], selectedTerminal: null });
  },
}));
