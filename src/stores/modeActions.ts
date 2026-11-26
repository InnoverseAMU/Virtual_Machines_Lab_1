import { collectInternalLinks, wiresFromNetlist } from '../core/circuit/nets';
import { getExperiment } from '../core/experiments/registry';
import { useControlsStore } from './controlsStore';
import { useSessionStore, type LabMode } from './sessionStore';
import { useWiringStore } from './wiringStore';

/**
 * Transitions cleanly into Self, Learn, or Observe mode for an experiment.
 * Resets controls/rows/session state and populates locked pre-wired connections
 * in Observe mode (or leaves an empty bench in Self/Learn mode).
 */
export function enterLabMode(experimentId: string, targetMode: LabMode): void {
  const experiment = getExperiment(experimentId);
  const wiring = useWiringStore.getState();
  const controls = useControlsStore.getState();
  const session = useSessionStore.getState();

  wiring.clearAllWiresScripted();
  controls.initFromControls(experiment.controls);
  session.resetLabSession();
  session.setMode(targetMode);

  if (targetMode === 'observe') {
    const pairs = wiresFromNetlist(
      experiment.acceptedNetlists[0],
      collectInternalLinks(experiment.components),
      experiment.components,
    );
    wiring.setObserveWires(pairs);
  }

  session.goToScreen('lab');
}
