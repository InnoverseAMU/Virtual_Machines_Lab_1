"""Mix score, procedural foley (from events.json), room tone, and ducked voiceover into out/mix.wav."""
import json
import os
import sys
import numpy as np
import soundfile as sf

LIB = os.environ.get('LIB', '/home/asad/claude-skills/lemo-opuscar')
sys.path.insert(0, LIB)
from core.audio import sfx
from core.audio.sfx import SR, add, lp, hp, bp, brown, norm

HERE = os.path.dirname(os.path.abspath(__file__))
DUR = 30.0


def compress_voice(x, threshold=0.25, ratio=3.0):
    """Gentle peak/RMS compression so TTS sits evenly."""
    abs_x = np.abs(x)
    gain = np.ones_like(x)
    over = abs_x > threshold
    gain[over] = (threshold + (abs_x[over] - threshold) / ratio) / (abs_x[over] + 1e-9)
    return x * gain


def foley_wire_snap(pitch=1.0):
    return sfx.click(pitch=pitch * 1.15, v=0.65)


def foley_switch_on():
    #Crisp mechanical breaker clack
    c1 = sfx.clack(pitch=0.8, v=0.9)
    c2 = sfx.click(pitch=1.4, v=0.6)
    out = np.zeros(max(len(c1), len(c2) + 800), dtype=np.float32)
    out[:len(c1)] += c1
    out[600:600 + len(c2)] += c2 * 0.7
    return norm(out) * 0.75


def foley_needle_tick():
    return sfx.click(pitch=1.8, v=0.35)


def foley_shimmer():
    d = 0.7
    t = sfx.t_(d)
    n = sfx.bp(sfx.noise(d), 2200, 6800)
    env = np.sin(np.pi * t / d) ** 2
    return norm(n * env) * 0.25


def foley_mcb_alarm():
    # Two short crisp warning beeps
    d = 0.28
    t = sfx.t_(d)
    beep = np.sin(2 * np.pi * 880 * t) * (1.0 - np.exp(-t / 0.005)) * np.exp(-t / 0.08)
    out = np.zeros(int(0.42 * SR), dtype=np.float32)
    out[:len(beep)] += beep
    out[int(0.14 * SR):int(0.14 * SR) + len(beep)] += beep * 0.85
    return norm(out) * 0.35


def main():
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    n_samples = int(round(DUR * SR))

    # 1. Load music score
    score_path = os.path.join(HERE, 'music', 'score.wav')
    music, sr = sf.read(score_path, dtype='float32')
    if len(music) < n_samples:
        music = np.pad(music, ((0, n_samples - len(music)), (0, 0)))
    music = music[:n_samples]

    # 2. Room tone ambience (very quiet, drops to digital zero at 15.3-16.0)
    amb = np.zeros((n_samples, 2), dtype=np.float32)
    room = brown(DUR) * 0.012
    amb[:, 0] = room
    amb[:, 1] = np.roll(room, 400)
    # Silence breath at 15.3 - 16.0 s
    s0, s1 = int(15.3 * SR), int(16.0 * SR)
    amb[s0:s1] = 0.0
    music[s0:s1] = 0.0

    # 3. Load events and render foley
    foley = np.zeros((n_samples, 2), dtype=np.float32)
    events_path = os.path.join(HERE, 'events.json')
    if os.path.exists(events_path):
        with open(events_path) as f:
            ev_data = json.load(f)
        for ev in ev_data.get('ev', []):
            t = ev['t']
            typ = ev.get('type', '')
            if typ == 'wire_snap':
                add(foley, foley_wire_snap(ev.get('pitch', 1.0)), t, gain=0.45, pan=0.0)
            elif typ == 'switch_on':
                add(foley, foley_switch_on(), t, gain=0.65, pan=-0.1)
            elif typ == 'needle_tick':
                add(foley, foley_needle_tick(), t, gain=0.35, pan=0.1)
            elif typ == 'light_sweep':
                add(foley, foley_shimmer(), t, gain=0.40, pan=0.0)
            elif typ == 'paper_slide':
                add(foley, sfx.whoosh(0.28, 0.5), t, gain=0.35, pan=-0.2)
            elif typ == 'red_pop':
                add(foley, sfx.clack(0.9, 0.6), t, gain=0.40, pan=0.15)
            elif typ in ('ui_expand', 'ui_click', 'toggle_click'):
                add(foley, sfx.click(1.3, 0.5), t, gain=0.35, pan=0.0)
            elif typ == 'mcb_alarm':
                add(foley, foley_mcb_alarm(), t, gain=0.50, pan=0.0)
            elif typ == 'chart_draw':
                add(foley, foley_shimmer(), t, gain=0.25, pan=0.2)

    # 4. Load voiceover lines & build voice bus + ducking envelope
    voice_bus = np.zeros((n_samples, 2), dtype=np.float32)
    duck_env = np.ones(n_samples, dtype=np.float32)

    # Voice placement matching timeline.js
    voice_cues = [
        ('v1_hook',  0.45),
        ('v2_prob1', 7.85),
        ('v3_prob2', 11.95),
        ('v4_learn', 16.05),
        ('v5_self',  18.05),
        ('v6_obs',   21.35),
        ('v7_end',   26.75),
    ]

    for vid, t0 in voice_cues:
        wav_path = os.path.join(HERE, 'voices', f'{vid}.wav')
        if not os.path.exists(wav_path):
            print(f'WARNING: missing {wav_path}')
            continue
        w, wsr = sf.read(wav_path, dtype='float32')
        if w.ndim > 1:
            w = w[:, 0]
        w = compress_voice(w)
        # Normalize voice RMS to healthy speech level
        rms = np.sqrt(np.mean(w ** 2)) + 1e-9
        w = w * (0.14 / rms)
        add(voice_bus, w, t0, gain=1.0, pan=0.0)

        # Duck music by ~8 dB (0.40) during voiceover with 120ms ramps
        i0 = max(0, int((t0 - 0.12) * SR))
        i1 = min(n_samples, int((t0 + len(w) / SR + 0.12) * SR))
        ramp = int(0.12 * SR)
        seg_len = i1 - i0
        if seg_len > 2 * ramp:
            env = np.full(seg_len, 0.38, dtype=np.float32)
            env[:ramp] = np.linspace(1.0, 0.38, ramp)
            env[-ramp:] = np.linspace(0.38, 1.0, ramp)
            duck_env[i0:i1] = np.minimum(duck_env[i0:i1], env)

    # 5. Sum buses: voice + ducked music + foley + ambience
    mix = voice_bus + music * (duck_env[:, None] * 0.42) + foley * (duck_env[:, None] * 0.65 + 0.35) + amb
    # Final peak safety limit
    peak = np.max(np.abs(mix))
    if peak > 0.92:
        mix = mix * (0.92 / peak)

    out_wav = os.path.join(HERE, 'out', 'mix.wav')
    sf.write(out_wav, mix, SR)
    print(f'Mix written to {out_wav} (peak={np.max(np.abs(mix)):.3f})')


if __name__ == '__main__':
    main()
