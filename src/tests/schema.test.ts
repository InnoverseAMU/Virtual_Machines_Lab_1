import { describe, expect, it } from 'vitest';
import { getComponentDef } from '../core/components';
import { ex3_1 } from '../core/experiments/ex3_1';
import { EXPERIMENTS } from '../core/experiments/registry';
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

  it('every terminal id referenced in ex3_1 exists in components.ts', () => {
    const validTerminals = new Set<string>();
    for (const comp of ex3_1.components) {
      const def = getComponentDef(comp.type);
      for (const t of def.terminals) {
        validTerminals.add(`${comp.id}.${t.name}`);
      }
    }

    const referenced = new Set<string>();
    for (const netlist of ex3_1.acceptedNetlists) {
      for (const net of netlist) {
        for (const t of net) referenced.add(t);
      }
    }
    for (const fault of ex3_1.faultPatterns) {
      for (const t of collectTerminalsFromClause(fault.match)) {
        referenced.add(t);
      }
      for (const grp of fault.match.anyGroup ?? []) {
        for (const t of collectTerminalsFromClause(grp)) {
          referenced.add(t);
        }
      }
    }
    for (const step of ex3_1.learnSteps) {
      for (const pair of step.connectTerminals ?? []) {
        referenced.add(pair[0]);
        referenced.add(pair[1]);
      }
    }

    for (const termId of referenced) {
      expect(validTerminals.has(termId), `Missing terminal: ${termId}`).toBe(
        true,
      );
    }
    // All apparatus terminals are accounted for in Netlist A
    const netATerminals = new Set(ex3_1.acceptedNetlists[0].flat());
    expect(netATerminals.size).toBe(validTerminals.size);
  });
});
