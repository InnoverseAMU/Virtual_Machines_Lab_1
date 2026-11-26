import type {
  ExperimentDef,
  NetCategoryKey,
  TerminalId,
  ValidationResult,
} from '../types';

const CATEGORY_MESSAGES: Record<NetCategoryKey, string> = {
  supply: 'The supply side is incomplete.',
  primary: 'The primary side is incomplete.',
  wattmeter: 'The wattmeter side is incomplete.',
  secondary: 'The secondary side is incomplete.',
  load: 'The load side is incomplete.',
};

export interface FeedbackOutput {
  correct: boolean;
  summary: string;
  categoryMessages: string[];
  faultMessages: string[];
  revealedHints: string[];
  remainingHints: number;
  terminalPairHint: [TerminalId, TerminalId] | null;
}

/**
 * Formats a ValidationResult into grouped category-level messages, Spec Section 5
 * fault feedback, and progressive hints without revealing exact wires until
 * the final hint level is reached.
 */
export function buildFeedback(
  experiment: ExperimentDef,
  result: ValidationResult,
  hintLevel: number,
): FeedbackOutput {
  const maxHints = experiment.hints.length;
  const clampedHintLevel = Math.max(0, Math.min(maxHints, Math.floor(hintLevel)));
  const revealedHints = experiment.hints.slice(0, clampedHintLevel);
  const remainingHints = Math.max(0, maxHints - clampedHintLevel);

  if (result.correct) {
    return {
      correct: true,
      summary: 'Connections correct. All circuit paths match the experiment.',
      categoryMessages: [],
      faultMessages: [],
      revealedHints,
      remainingHints,
      terminalPairHint: null,
    };
  }

  const seenCategories = new Set<string>();
  const categoryMessages: string[] = [];
  for (const open of result.openNets) {
    const msg = open.categoryKey
      ? CATEGORY_MESSAGES[open.categoryKey]
      : open.category;
    if (!seenCategories.has(msg)) {
      seenCategories.add(msg);
      categoryMessages.push(msg);
    }
  }

  if (result.shorts.length > 0) {
    const shortSummary = 'Two separate circuit nets are shorted together.';
    if (!seenCategories.has(shortSummary)) {
      seenCategories.add(shortSummary);
      categoryMessages.push(shortSummary);
    }
  }

  if (result.extras.length > 0) {
    const extraSummary = 'An unexpected extra connection is present.';
    if (!seenCategories.has(extraSummary)) {
      seenCategories.add(extraSummary);
      categoryMessages.push(extraSummary);
    }
  }

  const faultMessages = result.faults.map((f) => f.description);

  const hasOpens = result.openNets.length > 0;
  const hasFaults = faultMessages.length > 0 || result.shorts.length > 0;
  const summary =
    hasOpens && hasFaults
      ? 'Wiring is incomplete and has one or more connection faults.'
      : hasFaults
        ? 'Connection fault detected in your wiring.'
        : hasOpens
          ? 'Circuit wiring is incomplete.'
          : 'Unexpected wiring connection detected.';

  // Hint 6 (the final hint level) is only reachable after hints 1..5
  const terminalPairHint =
    clampedHintLevel >= maxHints && result.openNets.length > 0
      ? result.openNets[0].missingPairHint
      : null;

  return {
    correct: false,
    summary,
    categoryMessages,
    faultMessages,
    revealedHints,
    remainingHints,
    terminalPairHint,
  };
}
