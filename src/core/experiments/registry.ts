import { wiresFromNetlist } from '../circuit/nets';
import { ex3_1 } from './ex3_1';
import { ex3_2 } from './ex3_2';
import { ex3_3 } from './ex3_3';
import { ex3_4 } from './ex3_4';
import { ex3_5 } from './ex3_5';
import { ex3_6 } from './ex3_6';
import { ex4_1 } from './ex4_1';
import { ExperimentDefSchema } from './schema';
import type {
  ExperimentDef,
  ExperimentSummary,
  Net,
  TerminalId,
  WireEndpointPair,
} from '../types';

const RAW_EXPERIMENTS: ExperimentDef[] = [ex3_1, ex3_2, ex3_3, ex3_4, ex3_5, ex3_6, ex4_1];

export const EXPERIMENTS: Record<string, ExperimentDef> = Object.fromEntries(
  RAW_EXPERIMENTS.map((exp) => {
    const parsed = ExperimentDefSchema.parse(exp);
    return [parsed.id, parsed as ExperimentDef];
  }),
);

export const EXPERIMENT_SUMMARIES: ExperimentSummary[] = [
  {
    id: 'ex3.1',
    number: '3.1',
    title: 'Load test of single-phase transformer',
    group: 'transformers',
    available: true,
  },
  {
    id: 'ex3.2',
    number: '3.2',
    title: 'Open-circuit and short-circuit tests of single-phase transformer',
    group: 'transformers',
    available: true,
  },
  {
    id: 'ex3.3',
    number: '3.3',
    title: "Sumpner's test of single-phase transformer",
    group: 'transformers',
    available: true,
  },
  {
    id: 'ex3.4',
    number: '3.4',
    title: 'Parallel operation of single-phase transformers',
    group: 'transformers',
    available: true,
  },
  {
    id: 'ex3.5',
    number: '3.5',
    title: 'Study of various three-phase transformer connections',
    group: 'transformers',
    available: true,
  },
  {
    id: 'ex3.6',
    number: '3.6',
    title: 'Phase-transformation',
    group: 'transformers',
    available: true,
  },
  {
    id: 'ex4.1',
    number: '4.1',
    title: 'Load test of three-phase induction motor',
    group: 'induction',
    available: true,
  },
  {
    id: 'ex4.2',
    number: '4.2',
    title: 'No-load and blocked-rotor tests of three-phase induction motor',
    group: 'induction',
    available: false,
  },
  {
    id: 'ex4.5',
    number: '4.5',
    title:
      'No-load and blocked-rotor test of single-phase capacitor-start induction motor',
    group: 'induction',
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
export function netlistToWirePairs(
  netlist: Net[],
  internalLinks?: [TerminalId, TerminalId][],
): WireEndpointPair[] {
  if (internalLinks) {
    return wiresFromNetlist(netlist, internalLinks);
  }
  const pairs: WireEndpointPair[] = [];
  for (const net of netlist) {
    if (net.length < 2) continue;
    const filtered = [...net];
    if (filtered.includes('va.IN_N') && filtered.includes('va.OUT_N')) {
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
