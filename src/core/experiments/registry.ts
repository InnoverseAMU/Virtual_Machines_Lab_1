import { ex3_1 } from './ex3_1';
import { ExperimentDefSchema } from './schema';
import type { ExperimentDef, ExperimentSummary, Net, WireEndpointPair } from '../types';

const RAW_EXPERIMENTS: ExperimentDef[] = [ex3_1];

export const EXPERIMENTS: Record<string, ExperimentDef> = Object.fromEntries(
  RAW_EXPERIMENTS.map((exp) => {
    const parsed = ExperimentDefSchema.parse(exp);
    return [parsed.id, parsed as ExperimentDef];
  }),
);

export const EXPERIMENT_SUMMARIES: ExperimentSummary[] = [
  {
    id: 'ex3.1',
    title: 'Exp 3.1: Load test of single-phase transformer',
    subtitle: 'Voltage regulation & efficiency using a 2 kVA 230/115 V transformer and lamp bank',
    available: true,
  },
  {
    id: 'ex3.2',
    title: 'Exp 3.2: Open-circuit & short-circuit test',
    subtitle: 'Determine equivalent circuit parameters and losses',
    available: false,
  },
  {
    id: 'ex4.1',
    title: 'Exp 4.1: Three-phase induction motor load test',
    subtitle: 'Two-wattmeter method and slip-torque characteristics',
    available: false,
  },
];

export function getExperiment(id: string): ExperimentDef {
  const exp = EXPERIMENTS[id];
  if (!exp) {
    throw new Error(`Unknown experiment id: ${id}`);
  }
  return exp;
}

/**
 * Generates minimal star-topology wire pairs to realize a canonical netlist
 * (used by Show Solution).
 */
export function netlistToWirePairs(netlist: Net[]): WireEndpointPair[] {
  const pairs: WireEndpointPair[] = [];
  for (const net of netlist) {
    if (net.length < 2) continue;
    // Skip variac internal link IN_N <-> OUT_N if consecutive so we don't draw a redundant wire on top of the variac
    const filtered = [...net];
    if (filtered.includes('va.IN_N') && filtered.includes('va.OUT_N')) {
      // Connect sup.N -> va.IN_N, and connect remaining neutral terminals cleanly from va.OUT_N
      const others = filtered.filter(
        (t) => t !== 'sup.N' && t !== 'va.IN_N' && t !== 'va.OUT_N',
      );
      if (filtered.includes('sup.N')) {
        pairs.push(['sup.N', 'va.IN_N']);
      }
      for (const t of others) {
        pairs.push(['va.OUT_N', t]);
      }
      continue;
    }

    const hub = filtered[0];
    for (let i = 1; i < filtered.length; i++) {
      pairs.push([hub, filtered[i]]);
    }
  }
  return pairs;
}
