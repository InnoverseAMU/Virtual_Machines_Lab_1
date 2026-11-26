import { describe, expect, it } from 'vitest';
import { computeWireCurrentFlows } from '../core/circuit/flow';
import { collectInternalLinks, wiresFromNetlist } from '../core/circuit/nets';
import { getStage, getStageComponents } from '../core/circuit/stages';
import { ex3_1, NET_A } from '../core/experiments/ex3_1';
import { ex3_2, OC_NET_A, SC_NET_A } from '../core/experiments/ex3_2';
import { evaluateExperimentPhysics } from '../core/physics/evaluate';
import type { Wire } from '../core/types';

function toWires(pairs: [string, string][]): Wire[] {
  return pairs.map(([a, b], i) => ({ id: `w${i}`, a, b }));
}

describe('Circuit particle flow solver', () => {
  it('returns empty flows when supply is OFF or variac is 0 V', () => {
    const stage = getStage(ex3_1, 0);
    const comps = getStageComponents(ex3_1, stage);
    const wires = toWires(
      wiresFromNetlist(NET_A, collectInternalLinks(comps), comps),
    );

    const offControls = { 'sup.switch': false, 'va.knob': 230, 'ld.lamps': 5 };
    const offEval = evaluateExperimentPhysics(ex3_1, wires, offControls);
    expect(
      computeWireCurrentFlows(
        comps,
        wires,
        offControls,
        offEval.output,
        offEval.connectionState,
      ).size,
    ).toBe(0);

    const zeroControls = { 'sup.switch': true, 'va.knob': 0, 'ld.lamps': 5 };
    const zeroEval = evaluateExperimentPhysics(ex3_1, wires, zeroControls);
    expect(
      computeWireCurrentFlows(
        comps,
        wires,
        zeroControls,
        zeroEval.output,
        zeroEval.connectionState,
      ).size,
    ).toBe(0);
  });

  it('orients primary flow forward->neutral in Exp 3.1 and turns secondary flow on only when lamps > 0', () => {
    const stage = getStage(ex3_1, 0);
    const comps = getStageComponents(ex3_1, stage);
    // Deliberately reverse one wire endpoint pair to confirm direction flips to -1
    const rawPairs = wiresFromNetlist(NET_A, collectInternalLinks(comps), comps);
    const wires: Wire[] = rawPairs.map(([a, b], i) =>
      a === 'sup.P' && b === 'va.IN_P'
        ? { id: `w${i}`, a: b, b: a }
        : { id: `w${i}`, a, b },
    );

    const noLoadControls = {
      'sup.switch': true,
      'va.knob': 230,
      'wm.vRange': 300,
      'wm.iRange': 10,
      'ld.lamps': 0,
    };
    const noLoadEval = evaluateExperimentPhysics(ex3_1, wires, noLoadControls);
    const noLoadFlows = computeWireCurrentFlows(
      comps,
      wires,
      noLoadControls,
      noLoadEval.output,
      noLoadEval.connectionState,
    );

    const reversedPrimaryWire = wires.find(
      (w) => w.a === 'va.IN_P' && w.b === 'sup.P',
    )!;
    // Since current enters va.IN_P from sup.P, wire va.IN_P -> sup.P flows in -1 direction
    expect(noLoadFlows.get(reversedPrimaryWire.id)?.direction).toBe(-1);

    const secWire = wires.find(
      (w) =>
        (w.a === 'tx.S1' && w.b === 'am.IN') ||
        (w.a === 'am.IN' && w.b === 'tx.S1'),
    )!;
    expect(noLoadFlows.has(secWire.id)).toBe(false);

    // Turning lamps ON energises secondary current flow
    const loadedControls = { ...noLoadControls, 'ld.lamps': 8 };
    const loadedEval = evaluateExperimentPhysics(ex3_1, wires, loadedControls);
    const loadedFlows = computeWireCurrentFlows(
      comps,
      wires,
      loadedControls,
      loadedEval.output,
      loadedEval.connectionState,
    );
    expect(loadedFlows.get(secWire.id)?.direction).toBeTruthy();
  });

  it('computes LV primary loop in Exp 3.2 OC and HV+shorted-LV flows in Exp 3.2 SC', () => {
    const ocStage = getStage(ex3_2, 0);
    const ocComps = getStageComponents(ex3_2, ocStage);
    const ocWires = toWires(
      wiresFromNetlist(OC_NET_A, collectInternalLinks(ocComps), ocComps),
    );
    const ocControls = {
      'sup.switch': true,
      'va.knob': 115,
      'wm.vRange': 150,
      'wm.iRange': 1,
    };
    const ocEval = evaluateExperimentPhysics(ex3_2, ocWires, ocControls, undefined, {
      stageIndex: 0,
    });
    const ocFlows = computeWireCurrentFlows(
      ocComps,
      ocWires,
      ocControls,
      ocEval.output,
      ocEval.connectionState,
    );
    const lvFeed = ocWires.find(
      (w) =>
        (w.a === 'am.OUT' && w.b === 'tx.S1') ||
        (w.a === 'tx.S1' && w.b === 'am.OUT'),
    )!;
    expect(ocFlows.get(lvFeed.id)?.direction).toBe(
      lvFeed.a === 'am.OUT' ? 1 : -1,
    );

    const scStage = getStage(ex3_2, 1);
    const scComps = getStageComponents(ex3_2, scStage);
    const scWires = toWires(
      wiresFromNetlist(SC_NET_A, collectInternalLinks(scComps), scComps),
    );
    const scControls = {
      'sup.switch': true,
      'va.knob': 9.2,
      'wm.vRange': 75,
      'wm.iRange': 10,
    };
    const scEval = evaluateExperimentPhysics(ex3_2, scWires, scControls, undefined, {
      stageIndex: 1,
    });
    const scFlows = computeWireCurrentFlows(
      scComps,
      scWires,
      scControls,
      scEval.output,
      scEval.connectionState,
    );
    const lvShort = scWires.find(
      (w) =>
        (w.a === 'tx.S1' && w.b === 'tx.S2') ||
        (w.a === 'tx.S2' && w.b === 'tx.S1'),
    )!;
    expect(scFlows.get(lvShort.id)?.direction).toBe(
      lvShort.a === 'tx.S1' ? 1 : -1,
    );
  });
});
