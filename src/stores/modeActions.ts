import { collectInternalLinks, wiresFromNetlist } from '../core/circuit/nets';
import { getStage, getStageComponents } from '../core/circuit/stages';
import { getExperiment } from '../core/experiments/registry';
import { canonicalPairKey, getScrambledTerminalMap } from '../core/phasor/ex3_5Scramble';
import type { TerminalId } from '../core/types';
import { useControlsStore } from './controlsStore';
import {
  createSessionSeed,
  OBSERVE_FIXED_SEED,
  useSessionStore,
  type LabMode,
} from './sessionStore';
import { useWiringStore } from './wiringStore';

/**
 * Transitions cleanly into Self, Learn, or Observe mode for an experiment.
 * Resets controls/rows/session state, sets deterministic fixed seed in Observe
 * mode (or fresh session seed otherwise), and populates locked pre-wired
 * connections for Stage 0 in Observe mode.
 */
export function enterLabMode(experimentId: string, targetMode: LabMode): void {
  const experiment = getExperiment(experimentId);
  const stage = getStage(experiment, 0);
  const stageComponents = getStageComponents(experiment, stage);
  const meterIds = stageComponents
    .filter(
      (c) =>
        c.type === 'voltmeter' ||
        c.type === 'probeVoltmeter' ||
        c.type === 'ammeter' ||
        c.type === 'wattmeter',
    )
    .map((c) => c.id);

  const seed =
    targetMode === 'observe' ? OBSERVE_FIXED_SEED : createSessionSeed();

  const wiring = useWiringStore.getState();
  const controls = useControlsStore.getState();
  const session = useSessionStore.getState();

  wiring.clearAllWiresScripted();
  if (session.experimentId !== experimentId) {
    session.selectExperiment(experimentId);
  } else {
    session.resetLabSession();
  }
  session.setSessionSeed(seed);
  controls.initFromControls(stage.controls, seed, meterIds);
  session.setMode(targetMode);

  if (targetMode === 'observe') {
    const pairs = wiresFromNetlist(
      stage.acceptedNetlists[0],
      collectInternalLinks(stageComponents, useControlsStore.getState().values),
      stageComponents,
    );
    wiring.setObserveWires(pairs);
    if (stage.physicsModel === 'phasor-connections') {
      const map = getScrambledTerminalMap(seed);
      const truePairs = map.halfWindings.map(
        (hw) => [hw.posTerminal, hw.negTerminal] as [TerminalId, TerminalId],
      );
      useSessionStore.getState().setIdentifiedPairs(truePairs);
      if (experiment.stages.length > 0 && stage.id !== 'identify-pairs') {
        const groups = (['a', 'b', 'c'] as const).map((ph) =>
          map.halfWindings
            .filter((hw) => hw.phase === ph)
            .map((hw) => canonicalPairKey(hw.posTerminal, hw.negTerminal)),
        );
        useSessionStore.getState().setIdentifiedPhases(groups);
      }
    }
  }

  session.goToScreen('lab');
}
