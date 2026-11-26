import type { ReactNode } from 'react';
import { ASSET_MANIFEST, getExperimentAssets } from '../core/experiments/assets';
import { EXPERIMENT_SUMMARIES } from '../core/experiments/registry';
import type { ExperimentSummary } from '../core/types';
import { useSessionStore } from '../stores/sessionStore';
import { AUTHOR_GITHUB_URL, AUTHOR_NAME, INNOVERSE_URL, LabFooter } from './LabFooter';
import { CommonPdfLink, ExperimentPdfActions } from './PdfActions';
import { ThemeToggleButton } from './ThemeToggleButton';

type CardAccent = 'cyan' | 'amber' | 'yellow' | 'emerald' | 'pink' | 'purple';

interface CardThemeStyle {
  hoverGlowClass: string;
  cardBorder: string;
  iconBox: string;
  expLabel: string;
  titleHover: string;
  ctaButton: string;
}

const CARD_THEME_STYLES: Record<CardAccent, CardThemeStyle> = {
  cyan: {
    hoverGlowClass: 'glow-cyan-hover',
    cardBorder: 'border-sky-300/80 dark:border-cyan-500/40',
    iconBox:
      'bg-sky-50 border-sky-200 text-sky-600 shadow-xs dark:bg-cyan-950/70 dark:border-cyan-500/40 dark:text-cyan-400 dark:shadow-[0_0_20px_-4px_rgba(0,242,254,0.5)]',
    expLabel: 'text-sky-600 dark:text-cyan-400/90',
    titleHover: 'group-hover:text-sky-600 dark:group-hover:text-cyan-300',
    ctaButton:
      'bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white dark:from-cyan-500 dark:to-cyan-400 dark:hover:from-cyan-400 dark:hover:to-cyan-300 dark:text-slate-950 shadow-sm dark:shadow-[0_0_15px_rgba(0,242,254,0.35)]',
  },
  amber: {
    hoverGlowClass: 'glow-amber-hover',
    cardBorder: 'border-amber-300/80 dark:border-amber-500/40',
    iconBox:
      'bg-amber-50 border-amber-200 text-amber-600 shadow-xs dark:bg-amber-950/60 dark:border-amber-500/40 dark:text-amber-400 dark:shadow-[0_0_20px_-4px_rgba(245,158,11,0.5)]',
    expLabel: 'text-amber-600 dark:text-amber-400',
    titleHover: 'group-hover:text-amber-600 dark:group-hover:text-amber-300',
    ctaButton:
      'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-sm dark:shadow-[0_0_15px_rgba(245,158,11,0.3)]',
  },
  yellow: {
    hoverGlowClass: 'glow-yellow-hover',
    cardBorder: 'border-yellow-300/70 dark:border-yellow-500/30',
    iconBox:
      'bg-yellow-50 border-yellow-200 text-yellow-600 shadow-xs dark:bg-yellow-950/50 dark:border-yellow-500/40 dark:text-yellow-400 dark:shadow-[0_0_20px_-4px_rgba(234,179,8,0.4)]',
    expLabel: 'text-yellow-600 dark:text-yellow-400',
    titleHover: 'group-hover:text-yellow-600 dark:group-hover:text-yellow-300',
    ctaButton:
      'bg-yellow-400 hover:bg-yellow-300 text-slate-950 shadow-sm dark:shadow-[0_0_15px_rgba(234,179,8,0.3)]',
  },
  emerald: {
    hoverGlowClass: 'glow-emerald-hover',
    cardBorder: 'border-emerald-300/70 dark:border-emerald-500/30',
    iconBox:
      'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-xs dark:bg-emerald-950/50 dark:border-emerald-500/40 dark:text-emerald-400 dark:shadow-[0_0_20px_-4px_rgba(16,185,129,0.4)]',
    expLabel: 'text-emerald-600 dark:text-emerald-400',
    titleHover: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-300',
    ctaButton:
      'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm dark:shadow-[0_0_15px_rgba(16,185,129,0.3)]',
  },
  pink: {
    hoverGlowClass: 'glow-pink-hover',
    cardBorder: 'border-pink-300/70 dark:border-pink-500/30',
    iconBox:
      'bg-pink-50 border-pink-200 text-pink-600 shadow-xs dark:bg-pink-950/50 dark:border-pink-500/40 dark:text-pink-400 dark:shadow-[0_0_20px_-4px_rgba(236,72,153,0.4)]',
    expLabel: 'text-pink-600 dark:text-pink-400',
    titleHover: 'group-hover:text-pink-600 dark:group-hover:text-pink-300',
    ctaButton:
      'bg-pink-500 hover:bg-pink-400 text-white shadow-sm dark:shadow-[0_0_15px_rgba(236,72,153,0.3)]',
  },
  purple: {
    hoverGlowClass: 'glow-purple-hover',
    cardBorder: 'border-purple-300/70 dark:border-purple-500/30',
    iconBox:
      'bg-purple-50 border-purple-200 text-purple-600 shadow-xs dark:bg-purple-950/50 dark:border-purple-500/40 dark:text-purple-400 dark:shadow-[0_0_20px_-4px_rgba(168,85,247,0.4)]',
    expLabel: 'text-purple-600 dark:text-purple-400',
    titleHover: 'group-hover:text-purple-600 dark:group-hover:text-purple-300',
    ctaButton:
      'bg-purple-500 hover:bg-purple-400 text-white shadow-sm dark:shadow-[0_0_15px_rgba(168,85,247,0.3)]',
  },
};

interface ExperimentUiMeta {
  accent: CardAccent;
  description: string;
  icon: ReactNode;
}

const EXPERIMENT_UI_META: Record<string, ExperimentUiMeta> = {
  'ex3.1': {
    accent: 'cyan',
    description:
      'Perform a load test on a single-phase transformer. Determine (a) voltage regulation and (b) efficiency versus load characteristics.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M19 11a4 4 0 00-8 0m0 0a4 4 0 00-8 0m8 0v6m0-6V5m8 6a4 4 0 01-8 0m0 0a4 4 0 01-8 0m8 0v6m0-6V5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  'ex3.2': {
    accent: 'amber',
    description:
      'Determine core loss resistance (Rc), magnetizing reactance (Xm), and equivalent winding impedance (Req, Xeq) of a 1-phase unit.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M13 10V3L4 14h7v7l9-11h-7z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  'ex3.3': {
    accent: 'yellow',
    description:
      'Back-to-back regenerative heat run test to evaluate full-load temperature rise and steady-state thermal dissipation.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  'ex3.4': {
    accent: 'emerald',
    description:
      'Polarity verification, circulating current analysis, and proportionate load sharing across differing transformer impedances.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  'ex3.5': {
    accent: 'pink',
    description:
      'Star-Delta (Y-Δ), Delta-Star (Δ-Y), and Zig-zag configurations with phase angle displacement (0°, 30°, 180°).',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  'ex3.6': {
    accent: 'purple',
    description:
      'Conversion of balanced 3-phase supply to isolated 2-phase load system using Main (50% tap) and Teaser (86.6% tap).',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  'ex4.1': {
    accent: 'cyan',
    description:
      'Measure torque-speed characteristics, mechanical output power, rotor slip, efficiency, and power factor using calibrated brake rig.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  'ex4.2': {
    accent: 'amber',
    description:
      'Determine stator and rotor circuit parameters, windage and friction losses, and construct the full Heyland circle diagram.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
  'ex4.5': {
    accent: 'pink',
    description:
      'Investigate auxiliary winding parameters, centrifugal switch transition cutoffs, and split-phase capacitor starting torque.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M13 10V3L4 14h7v7l9-11h-7z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    ),
  },
};

export function ExperimentPicker() {
  const attempts = useSessionStore((s) => s.attempts);
  const completedExperiments = useSessionStore((s) => s.completedExperiments);
  const usedSolutionByExperiment = useSessionStore(
    (s) => s.usedSolutionByExperiment,
  );
  const learnCompleted = useSessionStore((s) => s.learnCompleted);
  const runCompleted = useSessionStore((s) => s.runCompleted);
  const runPractised = useSessionStore((s) => s.runPractised);
  const selectExperiment = useSessionStore((s) => s.selectExperiment);
  const goToScreen = useSessionStore((s) => s.goToScreen);

  const transformers = EXPERIMENT_SUMMARIES.filter(
    (e) => e.group === 'transformers',
  );
  const induction = EXPERIMENT_SUMMARIES.filter((e) => e.group === 'induction');

  const openExperimentMode = (exp: ExperimentSummary) => {
    if (!exp.available) return;
    selectExperiment(exp.id);
    goToScreen('mode');
  };

  const renderCard = (exp: ExperimentSummary) => {
    const isCompleted = completedExperiments.includes(exp.id);
    const isLearnDone = Boolean(learnCompleted[exp.id]);
    const isRunDone = Boolean(runCompleted[exp.id]);
    const isObserveDone = Boolean(runPractised[exp.id]);
    const attemptCount = attempts[exp.id] ?? 0;
    const usedSol = Boolean(usedSolutionByExperiment[exp.id]);
    const expAssets = getExperimentAssets(ASSET_MANIFEST, exp.id);

    const meta = EXPERIMENT_UI_META[exp.id] ?? {
      accent: 'cyan' as CardAccent,
      description: exp.title,
      icon: (
        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            d="M13 10V3L4 14h7v7l9-11h-7z"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      ),
    };
    const theme = CARD_THEME_STYLES[meta.accent];
    const hasProgressPills =
      exp.available &&
      (attemptCount > 0 || isLearnDone || isRunDone || isObserveDone || usedSol);

    return (
      <article
        key={exp.id}
        className={`vault-card ${theme.hoverGlowClass} ${theme.cardBorder} group relative flex w-full flex-col justify-between overflow-hidden rounded-2xl border p-6 shadow-md dark:shadow-lg ${
          exp.available ? '' : 'opacity-90'
        }`}
      >
        {/* Ambient internal shine */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full bg-sky-400/10 blur-2xl transition-all group-hover:bg-sky-400/20 dark:bg-cyan-500/10 dark:group-hover:bg-cyan-500/20"
        />

        <div className="flex flex-1 flex-col justify-between">
          {exp.available ? (
            <button
              type="button"
              onClick={() => openExperimentMode(exp)}
              className="w-full cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none rounded-lg"
            >
              <div className="mb-4 flex items-start justify-between">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-105 ${theme.iconBox}`}
                >
                  {meta.icon}
                </div>

                <div className="flex flex-col items-end space-y-1.5">
                  {isCompleted ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/80 dark:text-emerald-400 dark:shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                      ✓ Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:border-cyan-500/50 dark:bg-cyan-950/80 dark:text-cyan-400 dark:shadow-[0_0_8px_rgba(0,242,254,0.3)]">
                      Available
                    </span>
                  )}
                  <span className={`font-mono text-[11px] font-medium ${theme.expLabel}`}>
                    Exp {exp.number}
                  </span>
                </div>
              </div>

              <h3
                className={`text-base font-bold leading-snug text-slate-900 transition-colors sm:text-lg dark:text-white ${theme.titleHover}`}
              >
                {exp.title}
              </h3>

              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {meta.description}
              </p>
            </button>
          ) : (
            <div>
              <div className="mb-4 flex items-start justify-between">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-105 ${theme.iconBox}`}
                >
                  {meta.icon}
                </div>

                <div className="flex flex-col items-end space-y-1.5">
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    Coming soon
                  </span>
                  <span className={`font-mono text-[11px] font-medium ${theme.expLabel}`}>
                    Exp {exp.number}
                  </span>
                </div>
              </div>

              <h3
                className={`text-base font-bold leading-snug text-slate-900 transition-colors sm:text-lg dark:text-white ${theme.titleHover}`}
              >
                {exp.title}
              </h3>

              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {meta.description}
              </p>
            </div>
          )}

          {hasProgressPills && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
              {attemptCount > 0 && (
                <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-600 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-300">
                  Attempts: {attemptCount}
                </span>
              )}
              {isLearnDone && (
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-400">
                  Learn completed
                </span>
              )}
              {isRunDone && (
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/60 dark:text-emerald-400">
                  Run completed
                </span>
              )}
              {isObserveDone && (
                <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700 dark:border-cyan-500/30 dark:bg-cyan-950/60 dark:text-cyan-300">
                  Pre-wired practised
                </span>
              )}
              {usedSol && (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/60 dark:text-amber-300">
                  Used solution
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex items-center justify-between gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800/90">
          {exp.available ? (
            <>
              <button
                type="button"
                onClick={() => openExperimentMode(exp)}
                className={`flex-1 cursor-pointer rounded-xl px-3 py-2 text-center text-xs font-bold tracking-wide transition ${theme.ctaButton}`}
              >
                Select Experiment →
              </button>
              <ExperimentPdfActions
                pdf={expAssets.pdf}
                variant="card"
                tone="vault"
                label="PDF"
              />
            </>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <ExperimentPdfActions
                pdf={expAssets.pdf}
                variant="card"
                tone="vault"
                label="View Experiment PDF"
              />
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="vault-page fixed inset-0 flex flex-col overflow-x-hidden overflow-y-auto antialiased selection:bg-cyan-500 selection:text-slate-950">
      {/* Ambient Background Glow Gradients */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-1/2 -z-10 h-[400px] w-[1000px] -translate-x-1/2 bg-gradient-to-b from-sky-400/10 via-blue-400/5 to-transparent blur-[120px] dark:from-cyan-900/20 dark:via-blue-950/15"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-10 bottom-0 -z-10 h-[500px] w-[500px] bg-pink-400/5 blur-[140px] dark:bg-pink-950/15"
      />

      {/* TopBar */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-cyan-950/40 dark:bg-[#060a12]/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 text-xs sm:px-6 sm:text-sm lg:px-8">
          {/* Breadcrumb Lab Code */}
          <div className="flex items-center space-x-2 font-mono font-semibold tracking-wider text-sky-600 sm:space-x-3 dark:text-cyan-400/90">
            <span className="inline-flex items-center rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 dark:border-cyan-500/30 dark:bg-cyan-950/60 dark:text-cyan-300">
              EEC2912
            </span>
            <span className="text-slate-400 dark:text-slate-500">•</span>
            <span className="truncate tracking-wide text-slate-700 uppercase dark:text-slate-300">
              Electrical Machines Lab I
            </span>
          </div>

          {/* Action Utility Buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <a
              href={AUTHOR_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              title={`Built by ${AUTHOR_NAME} — View on GitHub`}
              className="hidden items-center gap-2 rounded-full border border-slate-300 bg-white/85 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs transition duration-200 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950 sm:inline-flex dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-cyan-500/40 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5 fill-current text-amber-500 dark:text-amber-400"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span>Star on GitHub</span>
            </a>

            <CommonPdfLink pdf={ASSET_MANIFEST.commonPdf} tone="vault" />
            <ThemeToggleButton variant="vault" />
          </div>
        </div>
      </header>

      {/* HeroSection */}
      <section className="relative mx-auto max-w-5xl px-4 pt-10 pb-8 text-center sm:pt-14 sm:pb-10">
        <div className="mx-auto mb-6 inline-flex max-w-3xl items-center gap-2.5 rounded-full border border-sky-300/80 bg-sky-50/90 px-4 py-1.5 font-space text-xs tracking-wide text-slate-700 shadow-xs sm:text-sm dark:border-cyan-500/40 dark:bg-cyan-950/50 dark:text-slate-300 dark:shadow-[0_0_15px_rgba(0,242,254,0.25)]">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-500 dark:bg-cyan-400" />
          <span>
            <strong className="font-semibold text-sky-700 dark:text-cyan-300">
              Curriculum Target:
            </strong>{' '}
            Designed for{' '}
            <strong className="font-medium text-slate-900 dark:text-white">
              B.Tech 2nd-Year
            </strong>{' '}
            students •{' '}
            <strong className="font-semibold text-amber-600 dark:text-amber-300">
              3rd Semester
            </strong>{' '}
            Electrical Engineering,{' '}
            <strong className="font-medium text-sky-700 dark:text-cyan-400">
              Aligarh Muslim University (AMU)
            </strong>
          </span>
        </div>

        <h1 className="neon-cyan-glow mb-3 font-orbitron text-3xl font-black tracking-wider text-sky-600 uppercase sm:text-5xl md:text-6xl dark:text-cyan-400">
          WELCOME TO VIRTUAL MACHINES LAB
        </h1>

        <p className="mx-auto max-w-3xl font-space text-sm tracking-wide text-slate-600 sm:text-base md:text-lg dark:text-slate-300">
          Your Digital{' '}
          <span className="font-semibold text-sky-600 underline decoration-sky-500/40 underline-offset-4 dark:text-cyan-400 dark:decoration-cyan-500/50">
            B.Tech Companion
          </span>{' '}
          &amp; Interactive 3D Circuit Workbench
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 dark:border-slate-800 dark:bg-slate-900/70">
            <span>Built by</span>
            <a
              href={AUTHOR_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-900 hover:text-sky-600 hover:underline dark:text-white dark:hover:text-cyan-300"
            >
              {AUTHOR_NAME}
            </a>
            <span className="text-slate-400">•</span>
            <a
              href={INNOVERSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sky-600 hover:text-sky-500 hover:underline dark:text-cyan-400 dark:hover:text-cyan-300"
            >
              Innoverse
            </a>
          </span>
        </div>
      </section>

      {/* MainContent */}
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-14 px-4 py-4 sm:px-6 lg:px-8">
        {/* Transformers Section */}
        <section aria-labelledby="group-transformers">
          <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="h-2.5 w-2.5 rounded-sm bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.6)] dark:bg-cyan-400 dark:shadow-[0_0_10px_#00f2fe]" />
              <h2
                id="group-transformers"
                className="font-orbitron text-sm font-bold tracking-widest text-slate-800 uppercase sm:text-base dark:text-slate-200"
              >
                TRANSFORMERS (3.1 TO 3.6)
              </h2>
              <span className="hidden font-mono text-xs text-slate-500 sm:inline">
                230V 1-PH &amp; 415V 3-PH BENCH
              </span>
            </div>
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              {transformers.length} Modules
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {transformers.map(renderCard)}
          </div>
        </section>

        {/* Induction Machines Section */}
        <section aria-labelledby="group-induction">
          <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="h-2.5 w-2.5 rounded-sm bg-purple-500 shadow-[0_0_10px_#a855f7] dark:bg-purple-400" />
              <h2
                id="group-induction"
                className="font-orbitron text-sm font-bold tracking-widest text-slate-800 uppercase sm:text-base dark:text-slate-200"
              >
                INDUCTION MACHINES (4.1, 4.2, 4.5)
              </h2>
              <span className="hidden font-mono text-xs text-slate-500 sm:inline">
                DYNAMOMETER BRAKE RIG &amp; ROTORS
              </span>
            </div>
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              {induction.length} Modules
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {induction.map(renderCard)}
          </div>
        </section>
      </main>

      <LabFooter variant="landing" />
    </div>
  );
}
