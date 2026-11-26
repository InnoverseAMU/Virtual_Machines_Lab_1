import { matchFaultPatterns } from './faults';
import { buildNets, type WireInput } from './nets';
import type {
  ExperimentDef,
  ExtraConnectionIssue,
  Net,
  OpenNetIssue,
  ShortIssue,
  TerminalId,
  ValidationResult,
} from '../types';

interface NetlistEvaluation {
  netlistIndex: number;
  openNets: OpenNetIssue[];
  shorts: ShortIssue[];
  extras: ExtraConnectionIssue[];
  score: number;
}

function evaluateAgainstNetlist(
  studentNets: Net[],
  terminalToStudentNet: Map<TerminalId, number>,
  acceptedNetlist: Net[],
  netlistIndex: number,
  experiment: ExperimentDef,
): NetlistEvaluation {
  const openNets: OpenNetIssue[] = [];
  const terminalToReqNet = new Map<TerminalId, number>();

  acceptedNetlist.forEach((reqNet, reqIdx) => {
    for (const t of reqNet) {
      terminalToReqNet.set(t, reqIdx);
    }

    const groups = new Map<number, TerminalId[]>();
    for (const t of reqNet) {
      const sIdx = terminalToStudentNet.get(t);
      if (sIdx === undefined) continue;
      const list = groups.get(sIdx);
      if (list) {
        list.push(t);
      } else {
        groups.set(sIdx, [t]);
      }
    }

    if (groups.size > 1) {
      const grouped = Array.from(groups.values());
      const missingPairHint: [TerminalId, TerminalId] = [
        grouped[0][0],
        grouped[1][0],
      ];
      const label = experiment.netLabels?.[reqIdx] ?? `Net ${reqIdx + 1}`;
      const category =
        experiment.netCategories?.[reqIdx] ?? `${label} is incomplete`;
      openNets.push({
        netIndex: reqIdx,
        label,
        category,
        missingPairHint,
      });
    }
  });

  const shorts: ShortIssue[] = [];
  const extras: ExtraConnectionIssue[] = [];

  for (const sNet of studentNets) {
    const reqIndices = new Set<number>();
    const outsideTerminals: TerminalId[] = [];

    for (const t of sNet) {
      const reqIdx = terminalToReqNet.get(t);
      if (reqIdx === undefined) {
        outsideTerminals.push(t);
      } else {
        reqIndices.add(reqIdx);
      }
    }

    if (reqIndices.size > 1) {
      const merged = Array.from(reqIndices).sort((a, b) => a - b);
      const names = merged.map(
        (idx) => experiment.netLabels?.[idx] ?? `Net ${idx + 1}`,
      );
      shorts.push({
        studentNet: sNet,
        mergedNetIndices: merged,
        description: `Short circuit joining ${names.join(' and ')}.`,
      });
    }

    // Flag extra connections involving terminals outside every required net
    // when a student actually wired them to something else (size > 1).
    if (outsideTerminals.length > 0 && sNet.length > 1) {
      extras.push({
        studentNet: sNet,
        extraTerminals: outsideTerminals,
      });
    }
  }

  const score = openNets.length + shorts.length * 2 + extras.length;
  return { netlistIndex, openNets, shorts, extras, score };
}

export const WIRING_BLOCKED_MESSAGE =
  'Always shut off power before handling the wiring.';

export function canModifyWiring(
  supplyOn: boolean,
): { allowed: true } | { allowed: false; message: string } {
  if (supplyOn) {
    return { allowed: false, message: WIRING_BLOCKED_MESSAGE };
  }
  return { allowed: true };
}

/**
 * Validates student wiring against all accepted netlists in an experiment
 * using union-find net equivalence (independent of wire order or draw direction).
 */
export function validateWiring(
  experiment: ExperimentDef,
  wires: WireInput[],
): ValidationResult {
  const graph = buildNets(experiment.components, wires);
  const faults = matchFaultPatterns(experiment.faultPatterns, graph);

  let bestEval: NetlistEvaluation | null = null;
  for (let i = 0; i < experiment.acceptedNetlists.length; i++) {
    const ev = evaluateAgainstNetlist(
      graph.nets,
      graph.terminalToNetIndex,
      experiment.acceptedNetlists[i],
      i,
      experiment,
    );
    if (bestEval === null || ev.score < bestEval.score) {
      bestEval = ev;
    }
    if (ev.score === 0) {
      bestEval = ev;
      break;
    }
  }

  const chosen = bestEval!;
  const correct =
    chosen.openNets.length === 0 &&
    chosen.shorts.length === 0 &&
    chosen.extras.length === 0 &&
    faults.length === 0;

  return {
    correct,
    matchedNetlistIndex: chosen.netlistIndex,
    openNets: chosen.openNets,
    shorts: chosen.shorts,
    extras: chosen.extras,
    faults,
    hintLevelAvailable: experiment.hints.length,
  };
}
