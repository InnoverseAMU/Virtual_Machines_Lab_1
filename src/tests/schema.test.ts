import { describe, expect, it } from 'vitest';
import { getStage, getStageComponents } from '../core/circuit/stages';
import { getComponentDef } from '../core/components';
import { ex3_1 } from '../core/experiments/ex3_1';
import {
  EXPERIMENT_SUMMARIES,
  EXPERIMENTS,
} from '../core/experiments/registry';
import { ExperimentDefSchema } from '../core/experiments/schema';
import type { FaultClause, TerminalId } from '../core/types';

function collectTerminalsFromClause(clause: FaultClause): TerminalId[] {
  const out: TerminalId[] = [];
  for (const pair of clause.connected ?? []) out.push(pair[0], pair[1]);
  for (const pair of clause.notConnected ?? []) out.push(pair[0], pair[1]);
  for (const pair of clause.anyConnected ?? []) out.push(pair[0], pair[1]);
  return out;
}

describe('Experiment schema and terminal integrity', () => {
  it('validates every registered experiment against ExperimentDefSchema', () => {
    for (const exp of Object.values(EXPERIMENTS)) {
      expect(() => ExperimentDefSchema.parse(exp)).not.toThrow();
    }
  });

  it('every terminal id referenced in every experiment stage exists in components.ts', () => {
    for (const exp of Object.values(EXPERIMENTS)) {
      for (const stage of exp.stages) {
        const stageComps = getStageComponents(exp, stage);
        const validTerminals = new Set<string>();
        for (const comp of stageComps) {
          const def = getComponentDef(comp.type);
          for (const t of def.terminals) {
            validTerminals.add(`${comp.id}.${t.name}`);
          }
        }

        const referenced = new Set<string>();
        for (const netlist of stage.acceptedNetlists) {
          for (const net of netlist) {
            for (const t of net) referenced.add(t);
          }
        }
        for (const fault of stage.faultPatterns) {
          for (const t of collectTerminalsFromClause(fault.match)) {
            referenced.add(t);
          }
          for (const grp of fault.match.anyGroup ?? []) {
            for (const t of collectTerminalsFromClause(grp)) {
              referenced.add(t);
            }
          }
        }
        for (const step of stage.learnSteps) {
          for (const pair of step.connectTerminals ?? []) {
            referenced.add(pair[0]);
            referenced.add(pair[1]);
          }
        }

        for (const termId of referenced) {
          expect(
            validTerminals.has(termId),
            `Missing terminal in ${exp.id}/${stage.id}: ${termId}`,
          ).toBe(true);
        }
      }
    }

    const stage0 = getStage(ex3_1, 0);
    const ex31Terminals = new Set<string>();
    for (const comp of getStageComponents(ex3_1, stage0)) {
      for (const t of getComponentDef(comp.type).terminals) {
        ex31Terminals.add(`${comp.id}.${t.name}`);
      }
    }
    const netATerminals = new Set(stage0.acceptedNetlists[0].flat());
    expect(netATerminals.size).toBe(ex31Terminals.size);
  });

  it('registry lists all 9 manual experiments with exact ids, titles, and ex3.1..ex4.2 available', () => {
    expect(EXPERIMENT_SUMMARIES).toHaveLength(9);
    const available = EXPERIMENT_SUMMARIES.filter((e) => e.available);
    expect(available.map((e) => e.id)).toEqual([
      'ex3.1',
      'ex3.2',
      'ex3.3',
      'ex3.4',
      'ex3.5',
      'ex3.6',
      'ex4.1',
      'ex4.2',
    ]);

    const expected: Array<[string, string, string]> = [
      ['ex3.1', '3.1', 'Load test of single-phase transformer'],
      [
        'ex3.2',
        '3.2',
        'Open-circuit and short-circuit tests of single-phase transformer',
      ],
      ['ex3.3', '3.3', "Sumpner's test of single-phase transformer"],
      ['ex3.4', '3.4', 'Parallel operation of single-phase transformers'],
      [
        'ex3.5',
        '3.5',
        'Study of various three-phase transformer connections',
      ],
      ['ex3.6', '3.6', 'Phase-transformation'],
      ['ex4.1', '4.1', 'Load test of three-phase induction motor'],
      [
        'ex4.2',
        '4.2',
        'No-load and blocked-rotor tests of three-phase induction motor',
      ],
      [
        'ex4.5',
        '4.5',
        'No-load and blocked-rotor test of single-phase capacitor-start induction motor',
      ],
    ];

    expect(
      EXPERIMENT_SUMMARIES.map((e) => [e.id, e.number, e.title]),
    ).toEqual(expected);
  });
});
