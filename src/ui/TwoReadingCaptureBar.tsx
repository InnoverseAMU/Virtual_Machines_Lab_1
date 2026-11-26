import type {
  ControlValues,
  PhysicsSolveOutput,
  StageDef,
} from '../core/types';
import { useSessionStore } from '../stores/sessionStore';

interface TwoReadingCaptureBarProps {
  stage: StageDef;
  output: PhysicsSolveOutput;
  values: ControlValues;
  supplyOn: boolean;
  energised: boolean;
}

export function TwoReadingCaptureBar({
  stage,
  output,
  values,
  supplyOn,
  energised,
}: TwoReadingCaptureBarProps) {
  const spec = stage.twoReadingCapture;
  const pending = useSessionStore((s) => s.pendingDualReading);
  const captureDualReading = useSessionStore((s) => s.captureDualReading);
  const clearPendingDualReading = useSessionStore(
    (s) => s.clearPendingDualReading,
  );

  if (!spec) return null;

  const sig = spec.invalidationControlIds
    .map((id) => String(values[id] ?? ''))
    .join('|');
  const activePending = pending && pending.signature === sig ? pending : null;

  const selVal = String(values[spec.selectorControlId] ?? spec.firstOption);
  const wm = Array.isArray(output.meters)
    ? output.meters.find((m) => m.id === spec.meterId)
    : undefined;
  const pointerReversed = Boolean(wm?.reversed);
  const damaged = Boolean(wm?.damaged);

  const canCapFirst =
    supplyOn &&
    energised &&
    selVal === spec.firstOption &&
    !pointerReversed &&
    !damaged;
  const canCapSecond =
    supplyOn &&
    energised &&
    selVal === spec.secondOption &&
    !pointerReversed &&
    !damaged;

  return (
    <div
      className="space-y-1.5 rounded-xl p-2 text-[11px]"
      style={{
        backgroundColor: 'var(--vml-panel-hover)',
        border: '1px solid var(--vml-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">One-Wattmeter Row Capture</span>
        {activePending && (
          <button
            type="button"
            onClick={clearPendingDualReading}
            className="text-[10px] font-semibold text-rose-400 hover:text-rose-300"
          >
            Reset pending
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={!canCapFirst}
          onClick={() => captureDualReading('first', output, values)}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            backgroundColor: activePending?.first
              ? '#059669'
              : 'var(--vml-panel)',
            color: activePending?.first ? '#ffffff' : 'var(--vml-text)',
            border: '1px solid var(--vml-border)',
          }}
        >
          {activePending?.first
            ? `W1: ${activePending.first.signedDiv.toFixed(1)} div${activePending.first.reverseOn ? ' (REV)' : ''}`
            : spec.firstLabel}
        </button>

        <button
          type="button"
          disabled={!canCapSecond}
          onClick={() => captureDualReading('second', output, values)}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            backgroundColor: activePending?.second
              ? '#059669'
              : 'var(--vml-panel)',
            color: activePending?.second ? '#ffffff' : 'var(--vml-text)',
            border: '1px solid var(--vml-border)',
          }}
        >
          {activePending?.second
            ? `W2: ${activePending.second.signedDiv.toFixed(1)} div${activePending.second.reverseOn ? ' (REV)' : ''}`
            : spec.secondLabel}
        </button>
      </div>

      {pointerReversed && supplyOn && energised && (
        <p className="text-[10px] text-amber-400">
          Wattmeter deflecting negative — flip Reverse (REV) switch ON before capturing W1.
        </p>
      )}
    </div>
  );
}
