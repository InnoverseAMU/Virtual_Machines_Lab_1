import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyStageCarryOver,
  getAllLearnSteps,
  getStage,
  getStageComponents,
  getStageIndexById,
} from '../core/circuit/stages';
import { validateWiring } from '../core/circuit/validate';
import { EXPERIMENTS } from '../core/experiments/registry';
import { ExperimentDefSchema } from '../core/experiments/schema';
import type { ExperimentDef, Wire } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { parseStoredProgress, useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';

function makeTwoStageExperiment(carryOver: 'none' | 'consistent-wires'): ExperimentDef {
  return {
    id: 'test-2stage',
    title: 'Two-stage test',
    object: ['Verify multi-stage flow.'],
    components: [
      { id: 'sup', type: 'acSupply', label: 'Supply', position: [-3, 0, 0], params: { V: 230 } },
      { id: 'va', type: 'variac1ph', label: 'Variac', position: [-1, 0, 0], params: { Vin: 230, VoutMax: 270 } },
      { id: 'vp', type: 'voltmeter', label: 'V1', position: [1, 0, 0], params: { range: 300 } },
      { id: 'am', type: 'ammeter', label: 'A1', position: [3, 0, 0], params: { range: 10 } },
    ],
    stages: [
      {
        id: 'stage-a',
        title: 'Stage A',
        summary: 'First stage',
        componentIds: ['sup', 'va', 'vp'],
        componentPositions: { vp: [1.5, 0, 0.5] },
        acceptedNetlists: [
          [
            ['sup.P', 'va.IN_P'],
            ['sup.N', 'va.IN_N', 'va.OUT_N', 'vp.B'],
            ['va.OUT_P', 'vp.A'],
          ],
        ],
        faultPatterns: [],
        controls: [
          { id: 'sup.switch', componentId: 'sup', kind: 'switch', label: 'Supply', defaultValue: false },
          { id: 'va.knob', componentId: 'va', kind: 'knob', label: 'Variac', min: 0, max: 270, step: 1, unit: 'V', defaultValue: 0 },
        ],
        physicsModel: 'transformerLoad',
        physicsParams: { V1rated: 230, vpRange: 300, vsRange: 150, amRange: 25, wmDivisions: 150 },
        observationTable: [
          { id: 'sno', label: '#', source: { kind: 'sno' } },
          { id: 'v1', label: 'V1', unit: 'V', source: { kind: 'meter', meterId: 'vp' }, decimals: 1 },
        ],
        rowRules: [],
        prerequisites: [],
        learnSteps: [
          {
            id: 'l1',
            stageId: 'stage-a',
            focus: ['sup', 'va'],
            camera: 'overview',
            title: 'Stage A learn',
            why: 'Wire supply.',
            connectTerminals: [['sup.P', 'va.IN_P']],
          },
        ],
      },
      {
        id: 'stage-b',
        title: 'Stage B',
        summary: 'Second stage',
        componentIds: ['sup', 'va', 'am'],
        componentPositions: { am: [1.5, 0, 0] },
        acceptedNetlists: [
          [
            ['sup.P', 'va.IN_P'],
            ['sup.N', 'va.IN_N', 'va.OUT_N', 'am.OUT'],
            ['va.OUT_P', 'am.IN'],
          ],
        ],
        faultPatterns: [],
        controls: [
          { id: 'sup.switch', componentId: 'sup', kind: 'switch', label: 'Supply', defaultValue: false },
          { id: 'va.knob', componentId: 'va', kind: 'knob', label: 'Variac', min: 0, max: 270, step: 0.1, unit: 'V', defaultValue: 0 },
        ],
        physicsModel: 'transformerLoad',
        physicsParams: { V1rated: 230, vpRange: 300, vsRange: 150, amRange: 25, wmDivisions: 150 },
        observationTable: [
          { id: 'sno', label: '#', source: { kind: 'sno' } },
        ],
        rowRules: [],
        prerequisites: [],
        learnSteps: [
          {
            id: 'l2',
            stageId: 'stage-b',
            focus: ['am'],
            camera: 'overview',
            title: 'Stage B learn',
            why: 'Wire ammeter.',
            connectTerminals: [['va.OUT_P', 'am.IN']],
          },
        ],
        carryOver,
      },
    ],
    answers: [],
    hints: ['Hint 1'],
    solutionNote: 'Note',
  };
}

describe('Stages framework (multi-stage validation, carryOver, progress, Learn/Observe)', () => {
  beforeEach(() => {
    useWiringStore.getState().clearAllWiresScripted();
    useSessionStore.getState().resetLabSession();
  });

  it('resolves stage-specific componentIds and componentPositions', () => {
    const exp = makeTwoStageExperiment('none');
    expect(() => ExperimentDefSchema.parse(exp)).not.toThrow();

    const s0 = getStage(exp, 0);
    const comps0 = getStageComponents(exp, s0);
    expect(comps0.map((c) => c.id)).toEqual(['sup', 'va', 'vp']);
    expect(comps0.find((c) => c.id === 'vp')?.position).toEqual([1.5, 0, 0.5]);

    const s1 = getStage(exp, 1);
    const comps1 = getStageComponents(exp, s1);
    expect(comps1.map((c) => c.id)).toEqual(['sup', 'va', 'am']);
    expect(comps1.find((c) => c.id === 'am')?.position).toEqual([1.5, 0, 0]);
  });

  it('applyStageCarryOver respects "none" and "consistent-wires"', () => {
    const expNone = makeTwoStageExperiment('none');
    const expConsistent = makeTwoStageExperiment('consistent-wires');
    const wires: Wire[] = [
      { id: 'w1', a: 'sup.P', b: 'va.IN_P' }, // consistent with stage B
      { id: 'w2', a: 'sup.N', b: 'va.IN_N' }, // consistent with stage B
      { id: 'w3', a: 'va.OUT_P', b: 'vp.A' }, // vp does not exist in stage B -> dropped
      { id: 'w4', a: 'sup.P', b: 'va.OUT_P' }, // different nets in stage B -> dropped
    ];

    const s1None = getStage(expNone, 1);
    expect(
      applyStageCarryOver(wires, s1None, getStageComponents(expNone, s1None)),
    ).toEqual([]);

    const s1Cons = getStage(expConsistent, 1);
    const kept = applyStageCarryOver(
      wires,
      s1Cons,
      getStageComponents(expConsistent, s1Cons),
    );
    expect(kept.map((w) => w.id)).toEqual(['w1', 'w2']);
  });

  it('validates each stage independently and aggregates learnSteps with stageId', () => {
    const exp = makeTwoStageExperiment('consistent-wires');
    const stageAWires: Wire[] = [
      { id: '1', a: 'sup.P', b: 'va.IN_P' },
      { id: '2', a: 'sup.N', b: 'va.IN_N' },
      { id: '3', a: 'va.OUT_N', b: 'vp.B' },
      { id: '4', a: 'va.OUT_P', b: 'vp.A' },
    ];
    expect(validateWiring(exp, stageAWires, 0).correct).toBe(true);
    expect(validateWiring(exp, stageAWires, 1).correct).toBe(false);

    const steps = getAllLearnSteps(exp);
    expect(steps.map((s) => s.stageId)).toEqual(['stage-a', 'stage-b']);
    expect(getStageIndexById(exp, 'stage-b')).toBe(1);
  });

  it('requires every stage wired in Self mode before adding to completedExperiments', () => {
    const exp = makeTwoStageExperiment('consistent-wires');
    EXPERIMENTS[exp.id] = exp;
    try {
      useSessionStore.setState({
        completedExperiments: [],
        completedStages: {},
        experimentId: exp.id,
        currentStageIndex: 0,
        mode: 'self',
      });

      const stageAWires: Wire[] = [
        { id: '1', a: 'sup.P', b: 'va.IN_P' },
        { id: '2', a: 'sup.N', b: 'va.IN_N' },
        { id: '3', a: 'va.OUT_P', b: 'vp.A' },
        { id: '4', a: 'va.OUT_N', b: 'vp.B' },
      ];
      useWiringStore.getState().setSolutionWires(stageAWires.map((w) => [w.a, w.b]));
      useControlsStore.getState().setVariacV(120);

      const res0 = useSessionStore.getState().submitWiring(useWiringStore.getState().wires);
      expect(res0.correct).toBe(true);
      expect(useSessionStore.getState().completedStages[exp.id]).toEqual(['stage-a']);
      expect(useSessionStore.getState().completedExperiments).not.toContain(exp.id);

      // Continue to stage 2: controls reset, consistent wires carried over
      useSessionStore.getState().continueToNextStage();
      expect(useSessionStore.getState().currentStageIndex).toBe(1);
      expect(useControlsStore.getState().values['va.knob']).toBe(0);
      expect(useWiringStore.getState().wires.map((w) => [w.a, w.b])).toEqual([
        ['sup.P', 'va.IN_P'],
        ['sup.N', 'va.IN_N'],
      ]);

      // Wire remaining stage B connections and submit
      useWiringStore.getState().setSolutionWires([
        ['sup.P', 'va.IN_P'],
        ['sup.N', 'va.IN_N'],
        ['va.OUT_N', 'am.OUT'],
        ['va.OUT_P', 'am.IN'],
      ]);
      const res1 = useSessionStore.getState().submitWiring(useWiringStore.getState().wires);
      expect(res1.correct).toBe(true);
      expect(useSessionStore.getState().completedStages[exp.id]).toEqual([
        'stage-a',
        'stage-b',
      ]);
      expect(useSessionStore.getState().completedExperiments).toContain(exp.id);
    } finally {
      delete EXPERIMENTS[exp.id];
    }
  });

  it('migrates legacy saved progress without completedStages', () => {
    const legacy = JSON.stringify({
      attempts: { 'ex3.1': 3 },
      completedExperiments: ['ex3.1'],
      usedSolutionByExperiment: { 'ex3.1': false },
      learnCompleted: { 'ex3.1': true },
      runCompleted: { 'ex3.1': true },
    });
    const migrated = parseStoredProgress(legacy);
    expect(migrated.version).toBe(2);
    expect(migrated.completedStages['ex3.1']).toEqual(['load-test']);
    expect(migrated.completedExperiments).toEqual(['ex3.1']);
  });
});
