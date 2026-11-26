import type { FeedbackOutput } from '../core/circuit/feedback';

interface HintPanelProps {
  feedback: FeedbackOutput;
  hintLevel: number;
}

export function HintPanel({ feedback, hintLevel }: HintPanelProps) {
  if (hintLevel <= 0 && !feedback.terminalPairHint) return null;

  return (
    <div
      className="space-y-2 rounded-xl p-3 text-xs"
      style={{
        backgroundColor: 'var(--vml-panel-hover)',
        border: '1px solid var(--vml-border)',
      }}
    >
      <div className="flex items-center justify-between font-semibold">
        <span>Hints ({feedback.revealedHints.length})</span>
        <span style={{ color: 'var(--vml-text-muted)' }}>
          {feedback.remainingHints} left
        </span>
      </div>

      <ol className="list-decimal space-y-1.5 pl-4">
        {feedback.revealedHints.map((hint, idx) => (
          <li key={idx} className="leading-relaxed">
            {hint}
          </li>
        ))}
      </ol>

      {feedback.terminalPairHint && (
        <div
          className="rounded-lg px-3 py-2 font-mono text-xs font-semibold"
          style={{
            backgroundColor: 'var(--vml-panel)',
            border: '1px solid var(--vml-accent)',
            color: 'var(--vml-accent)',
          }}
        >
          First incomplete net pair: {feedback.terminalPairHint[0]} ↔{' '}
          {feedback.terminalPairHint[1]}
        </div>
      )}
    </div>
  );
}
