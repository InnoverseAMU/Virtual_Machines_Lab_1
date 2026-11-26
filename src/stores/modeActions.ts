import { collectInternalLinks, wiresFromNetlist } from '../core/circuit/nets';
import { getStage, getStageComponents } from '../core/circuit/stages';
import { getExperiment } from '../core/experiments/registry';
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
  session.resetLabSession();
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
  }

  session.goToScreen('lab');
}
