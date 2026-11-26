import { useEffect } from 'react';
import type { CameraPreset } from './core/types';
import { BenchScene } from './scenes/BenchScene';
import { useSessionStore } from './stores/sessionStore';
import { useWiringStore } from './stores/wiringStore';

const PRESET_BUTTONS: { id: CameraPreset; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'supply', label: 'Supply' },
  { id: 'meters', label: 'Meters' },
  { id: 'transformer', label: 'Transformer' },
  { id: 'load', label: 'Load' },
];

export function App() {
  const cameraPreset = useSessionStore((s) => s.cameraPreset);
  const setCameraPreset = useSessionStore((s) => s.setCameraPreset);
  const selectedTerminal = useWiringStore((s) => s.selectedTerminal);
  const clearSelectedTerminal = useWiringStore((s) => s.clearSelectedTerminal);
  const wireCount = useWiringStore((s) => s.wires.length);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearSelectedTerminal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelectedTerminal]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 select-none">
      <BenchScene />

      {/* Minimal 2a camera preset & wiring status bar */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-wrap items-center justify-center gap-2 px-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/85 p-1 shadow-lg backdrop-blur">
          {PRESET_BUTTONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setCameraPreset(p.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                cameraPreset === p.id
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="rounded-full border border-slate-700/80 bg-slate-900/85 px-3 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur">
          {selectedTerminal ? (
            <span>
              Selected: <strong className="text-sky-300">{selectedTerminal}</strong>{' '}
              (click target terminal or Esc)
            </span>
          ) : (
            <span>Wires: {wireCount} · Click terminals to wire, click wire to delete</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
