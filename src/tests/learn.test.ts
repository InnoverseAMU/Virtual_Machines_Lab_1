import { describe, expect, it } from 'vitest';
import {
  evaluateLearnStepCondition,
  findVariacForTargetV1,
} from '../core/circuit/learn';
import { buildNets } from '../core/circuit/nets';
import { validateWiring } from '../core/circuit/validate';
import { getComponentDef } from '../core/components';
import { ex3_1, NET_A } from '../core/experiments/ex3_1';
import { netlistToWirePairs } from '../core/experiments/registry';
import { evaluateExperimentPhysics } from '../core/physics/evaluate';
import type { TransformerLoadControls, WireEndpointPair } from '../core/types';

describe('Exp 3.1 Learn mode steps and conditions', () => {
  it('has 17 learn steps referencing existing component ids and terminal ids', () => {
    expect(ex3_1.learnSteps).toHaveLength(17);

    const componentIds = new Set(ex3_1.components.map((c) => c.id));
    const terminalIds = new Set<string>();
    for (const c of ex3_1.components) {
      for (const t of getComponentDef(c.type).terminals) {
        terminalIds.add(`${c.id}.${t.name}`);
      }
    }

    for (const step of ex3_1.learnSteps) {
      expect(step.id).toBeTruthy();
      for (const cid of step.focus) {
        expect(componentIds.has(cid), `Unknown component in focus: ${cid}`).toBe(
          true,
        );
      }
      for (const [a, b] of step.connectTerminals ?? []) {
        expect(terminalIds.has(a), `Unknown terminal: ${a}`).toBe(true);
        expect(terminalIds.has(b), `Unknown terminal: ${b}`).toBe(true);
      }
    }
  });

  it('wires drawn across all learn steps equal Netlist A exactly', () => {
    const stepWires: WireEndpointPair[] = ex3_1.learnSteps.flatMap(
      (s) => s.connectTerminals ?? [],
    );
    const res = validateWiring(ex3_1, stepWires);
    expect(res.correct).toBe(true);
    expect(res.matchedNetlistIndex).toBe(0);

    const stepNets = buildNets(ex3_1.components, stepWires).nets;
    const netANets = buildNets(
      ex3_1.components,
      netlistToWirePairs(NET_A),
    ).nets;
    expect(stepNets).toEqual(netANets);
  });

  it('step 12 condition requires supply ON and V1 within 230 +/- 3 V', () => {
    const step12 = ex3_1.learnSteps[11];
    const stepWires = ex3_1.learnSteps.flatMap((s) => s.connectTerminals ?? []);

    const offControls: TransformerLoadControls = {
      supplyOn: false,
      variacV: 230,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 0,
    };
    const offOut = evaluateExperimentPhysics(ex3_1, stepWires, offControls).output;
    expect(
      evaluateLearnStepCondition(step12, offControls, offOut, false).met,
    ).toBe(false);

    const lowControls: TransformerLoadControls = {
      ...offControls,
      supplyOn: true,
      variacV: 200,
    };
    const lowOut = evaluateExperimentPhysics(ex3_1, stepWires, lowControls).output;
    expect(
      evaluateLearnStepCondition(step12, lowControls, lowOut, false).met,
    ).toBe(false);

    const okControls: TransformerLoadControls = {
      ...offControls,
      supplyOn: true,
      variacV: 230,
    };
    const okOut = evaluateExperimentPhysics(ex3_1, stepWires, okControls).output;
    expect(
      evaluateLearnStepCondition(step12, okControls, okOut, false).met,
    ).toBe(true);
  });

  it('step 13 condition requires supply ON, 0 lamps, V1 within 230 +/- 3 V, and Got it ack', () => {
    const step13 = ex3_1.learnSteps[12];
    const stepWires = ex3_1.learnSteps.flatMap((s) => s.connectTerminals ?? []);
    const controls: TransformerLoadControls = {
      supplyOn: true,
      variacV: 230,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 0,
    };
    const out = evaluateExperimentPhysics(ex3_1, stepWires, controls).output;

    const beforeAck = evaluateLearnStepCondition(step13, controls, out, false);
    expect(beforeAck.canAcknowledge).toBe(true);
    expect(beforeAck.met).toBe(false);

    const afterAck = evaluateLearnStepCondition(step13, controls, out, true);
    expect(afterAck.met).toBe(true);

    // Turning on lamps invalidates no-load readiness
    const withLoad: TransformerLoadControls = { ...controls, lamps: 1 };
    const loadOut = evaluateExperimentPhysics(ex3_1, stepWires, withLoad).output;
    expect(
      evaluateLearnStepCondition(step13, withLoad, loadOut, true).met,
    ).toBe(false);
  });

  it('step 14 condition requires >= 5 lamps ON and V1 re-adjusted to 230 +/- 3 V', () => {
    const step14 = ex3_1.learnSteps[13];
    const stepWires = ex3_1.learnSteps.flatMap((s) => s.connectTerminals ?? []);

    const fewLamps: TransformerLoadControls = {
      supplyOn: true,
      variacV: 231,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 4,
    };
    const fewOut = evaluateExperimentPhysics(ex3_1, stepWires, fewLamps).output;
    expect(
      evaluateLearnStepCondition(step14, fewLamps, fewOut, false).met,
    ).toBe(false);

    const tenLamps: TransformerLoadControls = {
      supplyOn: true,
      variacV: 233,
      wmVRange: 300,
      wmIRange: 10,
      lamps: 10,
    };
    const tenOut = evaluateExperimentPhysics(ex3_1, stepWires, tenLamps).output;
    expect(
      evaluateLearnStepCondition(step14, tenLamps, tenOut, false).met,
    ).toBe(true);
  });

  it('findVariacForTargetV1 finds knob value producing V1 = 230 +/- 1 V across lamp counts', () => {
    const stepWires = ex3_1.learnSteps.flatMap((s) => s.connectTerminals ?? []);
    for (const lamps of [0, 5, 10, 12]) {
      const knob = findVariacForTargetV1(ex3_1, stepWires, 230, lamps);
      const out = evaluateExperimentPhysics(ex3_1, stepWires, {
        supplyOn: true,
        variacV: knob,
        wmVRange: 300,
        wmIRange: 10,
        lamps,
      }).output;
      expect(Math.abs(out.meters.vp.shownValue - 230)).toBeLessThanOrEqual(1);
    }
  });
});
