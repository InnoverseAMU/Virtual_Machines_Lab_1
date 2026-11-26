import { netlistToWirePairs } from '../core/experiments/registry';
import type { ExperimentDef } from '../core/types';
import { useControlsStore } from '../stores/controlsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useWiringStore } from '../stores/wiringStore';

interface SolutionBannerProps {
  experiment: ExperimentDef;
}

export function SolutionBanner({ experiment }: SolutionBannerProps) {
  const showingSolution = useSessionStore((s) => s.showingSolution);
  const exitSolutionView = useSessionStore((s) => s.exitSolutionView);
  const supplyOn = useControlsStore((s) => s.supplyOn);
  const setSolutionWires = useWiringStore((s) => s.setSolutionWires);

  if (!showingSolution) return null;

  const applyToBench = () => {
    if (supplyOn) return;
    setSolutionWires(netlistToWirePairs(experiment.acceptedNetlists[0]));
    exitSolutionView();
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-16 left-1/2 z-20 flex w-[min(94%,34rem)] -translate-x-1/2 flex-wrap items-center justify-between gap-2.5 rounded-2xl px-4 py-2.5 text-xs shadow-2xl backdrop-blur md:bottom-4"
      style={{
        backgroundColor: 'var(--vml-panel)',
        border: '1px solid var(--vml-accent)',
        color: 'var(--vml-text)',
      }}
    >
      <div className="min-w-44 flex-1">
        <div className="font-bold" style={{ color: 'var(--vml-accent)' }}>
          Solution Overlay
        </div>
        <div className="text-[11px]" style={{ color: 'var(--vml-text-muted)' }}>
          {supplyOn
            ? 'Shut off the supply before applying solution wires.'
            : 'Connection (a) shown as dashed blue wires. Connection (b) with V1 tied to L is also valid.'}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={applyToBench}
          disabled={supplyOn}
          className="rounded-lg px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: 'var(--vml-accent)',
            color: 'var(--vml-accent-text)',
          }}
        >
          Apply to bench
        </button>
        <button
          type="button"
          onClick={exitSolutionView}
          className="rounded-lg px-3 py-1.5 font-semibold"
          style={{
            backgroundColor: 'var(--vml-panel-hover)',
            border: '1px solid var(--vml-border)',
          }}
        >
          Exit solution view
        </button>
      </div>
    </div>
  );
}
