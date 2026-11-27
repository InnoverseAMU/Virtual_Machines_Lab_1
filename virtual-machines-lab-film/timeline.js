// Single source of truth for timing, tempo, voice placement, subtitles, and visual cues.
export const DUR = 30.0;
export const BPM = 120;
export const BEAT = 60 / BPM; // 0.5 s

export const SECS = [
  { id: 'hero',     t0: 0.0,  t1: 8.0,  bpm: BPM },
  { id: 'problem',  t0: 8.0,  t1: 16.0, bpm: BPM },
  { id: 'features', t0: 16.0, t1: 27.0, bpm: BPM },
  { id: 'end',      t0: 27.0, t1: 30.0, bpm: BPM },
];

// Exact voice durations from voices/dur.json
export const VOICE_CUES = [
  { id: 'v1_hook',  t0: 0.45,  dur: 5.595, text: 'Wire a transformer test, switch on, and watch the meters respond. All in 3D.' },
  { id: 'v2_prob1', t0: 7.85,  dur: 3.997, text: 'But in a real lab, high voltage means you rarely do the wiring.' },
  { id: 'v3_prob2', t0: 11.95, dur: 4.090, text: 'You learn from a diagram, and one wrong connection can damage equipment.' },
  { id: 'v4_learn', t0: 16.05, dur: 1.897, text: 'Learn mode explains every step.' },
  { id: 'v5_self',  t0: 18.05, dur: 3.196, text: 'Self mode checks your wiring and shows what went wrong.' },
  { id: 'v6_obs',   t0: 21.35, dur: 2.593, text: 'Take readings, plot curves, check your answers.' },
  { id: 'v7_end',   t0: 26.75, dur: 3.241, text: 'Virtual Machines Lab. Practise before you power on.' },
];

// Subtitles: hold >= max(1.8s, speech + 0.6s), capped to next cue or DUR
export const SUBTITLES = [
  { t0: 0.45,  t1: 6.65,  text: 'Wire a transformer test, switch on, and watch the meters respond. All in 3D.' },
  { t0: 7.85,  t1: 11.90, text: 'But in a real lab, high voltage means you rarely do the wiring.' },
  { t0: 11.95, t1: 16.02, text: 'You learn from a diagram, and one wrong connection can damage equipment.' },
  { t0: 16.05, t1: 18.02, text: 'Learn mode explains every step.' },
  { t0: 18.05, t1: 21.32, text: 'Self mode checks your wiring and shows what went wrong.' },
  { t0: 21.35, t1: 24.55, text: 'Take readings, plot curves, check your answers.' },
  { t0: 26.75, t1: 29.98, text: 'Virtual Machines Lab. Practise before you power on.' },
];

// Key visual & sound events
export const EVENTS = [
  { t: 0.0,  type: 'room_start' },
  { t: 0.8,  type: 'wire_snap', pitch: 1.0 },
  { t: 1.5,  type: 'wire_snap', pitch: 1.08 },
  { t: 2.2,  type: 'wire_snap', pitch: 1.15 },
  { t: 5.5,  type: 'switch_on' },
  { t: 5.8,  type: 'needle_tick' },
  { t: 6.4,  type: 'light_sweep' },
  { t: 8.0,  type: 'paper_slide' },
  { t: 10.0, type: 'red_pop', idx: 0 },
  { t: 11.8, type: 'red_pop', idx: 1 },
  { t: 13.6, type: 'red_pop', idx: 2 },
  { t: 15.3, type: 'silence_drop' },
  { t: 16.0, type: 'ui_expand', id: 'learn' },
  { t: 18.0, type: 'mcb_alarm' },
  { t: 20.2, type: 'ui_expand', id: 'obs' },
  { t: 21.0, type: 'chart_draw' },
  { t: 22.6, type: 'ui_click', id: 'diagram' },
  { t: 24.1, type: 'light_sweep' },
  { t: 25.5, type: 'toggle_click' },
  { t: 27.0, type: 'end_card' },
];
