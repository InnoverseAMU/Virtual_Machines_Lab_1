"""Original synthesized score for Virtual Machines Lab (Dark Tech Keynote, 120 BPM, 30.0 s)."""
import os
import sys
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

LIB = os.environ.get('LIB', '/home/asad/claude-skills/lemo-opuscar')
sys.path.insert(0, LIB)
from core.audio.sfx import SR, add, lp, hp, bp

DUR = 30.0
BPM = 120.0
BEAT = 60.0 / BPM  # 0.5 s


def midi_to_hz(m):
    return 440.0 * (2.0 ** ((m - 69) / 12.0))


def vibraphone(midi, dur=1.6, vel=0.7, trem=4.5):
    """Modal vibraphone bar: fundamental + 4th + 10th partial + soft mallet transient."""
    f = midi_to_hz(midi)
    n = int(round((dur + 0.4) * SR))
    t = np.arange(n) / SR
    # Mallet attack
    att = 1.0 - np.exp(-t / 0.004)
    # Vibraphone partials (1, 4, 10)
    env1 = np.exp(-t / max(0.35, dur * 0.55))
    env2 = np.exp(-t / 0.22)
    env3 = np.exp(-t / 0.06)
    lfo = 1.0 - 0.14 * (0.5 - 0.5 * np.cos(2 * np.pi * trem * t))
    sig = (
        np.sin(2 * np.pi * f * t) * env1 * lfo
        + 0.22 * np.sin(2 * np.pi * (f * 3.99) * t) * env2
        + 0.06 * np.sin(2 * np.pi * (f * 9.95) * t) * env3
    ) * att
    # Soft mallet thump
    rng = np.random.default_rng(int(midi * 100))
    thump = lp(rng.standard_normal(n), 900) * np.exp(-t / 0.008) * 0.12
    out = (sig + thump) * vel * 0.35
    fade = min(int(0.05 * SR), n)
    out[-fade:] *= np.linspace(1.0, 0.0, fade)
    return out.astype(np.float32)


def marimba_sting(midi, vel=0.55, detune_cents=0.0):
    """Dry, slightly detuned marimba/wood bar for problem tension stings."""
    f = midi_to_hz(midi + detune_cents / 100.0)
    dur = 0.55
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    att = 1.0 - np.exp(-t / 0.002)
    sig = (
        np.sin(2 * np.pi * f * t) * np.exp(-t / 0.14)
        + 0.30 * np.sin(2 * np.pi * (f * 3.98) * t) * np.exp(-t / 0.05)
    ) * att
    return (sig * vel * 0.32).astype(np.float32)


def sine_pulse(midi, dur=0.45, vel=0.6):
    """Clean low sine pulse with subtle 2nd/3rd harmonics so it speaks on small speakers."""
    f = midi_to_hz(midi)
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    att = 1.0 - np.exp(-t / 0.006)
    dec = np.exp(-t / (dur * 0.42))
    sig = (
        0.75 * np.sin(2 * np.pi * f * t)
        + 0.20 * np.sin(2 * np.pi * (2 * f) * t)
        + 0.06 * np.sin(2 * np.pi * (3 * f) * t)
    ) * att * dec
    fade = min(int(0.03 * SR), n)
    sig[-fade:] *= np.linspace(1.0, 0.0, fade)
    return (sig * vel * 0.28).astype(np.float32)


def shaker(vel=0.25, seed=1):
    """Crisp minimal shaker tick."""
    n = int(round(0.055 * SR))
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    noise = bp(rng.standard_normal(n), 5500, 11000)
    env = np.exp(-t / 0.014) * (1.0 - np.exp(-t / 0.002))
    return (noise * env * vel * 0.14).astype(np.float32)


def glock_ping(midi, vel=0.4):
    """Bright glockenspiel harmonic ping for feature cuts."""
    f = midi_to_hz(midi)
    dur = 0.85
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    sig = (
        np.sin(2 * np.pi * f * t) * np.exp(-t / 0.32)
        + 0.25 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.12)
    ) * (1.0 - np.exp(-t / 0.0015))
    return (sig * vel * 0.20).astype(np.float32)


def render_score(out_path):
    buf = np.zeros((int(round(DUR * SR)), 2), dtype=np.float32)

    # --- ACT I: 0.0 - 8.0 s (Additive vibraphone arpeggio in D Dorian, pulse, shaker) ---
    arp_notes = [62, 65, 69, 72, 74, 72, 69, 65]  # D4 F4 A4 C5 D5 C5 A4 F4
    for step in range(32):  # 32 quarter/8th steps across 8s (every 0.25s)
        t = step * 0.25
        bar = int(t // 2.0)
        # Additive build: bar 0 plays every 2nd step, bar 1+ plays full 8ths
        if bar == 0 and step % 2 == 1:
            continue
        note = arp_notes[step % len(arp_notes)]
        vel = 0.35 + 0.06 * bar
        pan = -0.25 if step % 2 == 0 else 0.25
        add(buf, vibraphone(note, dur=0.9, vel=vel), t, gain=0.75, pan=pan)
        if bar >= 1 and step % 2 == 1:
            add(buf, shaker(vel=0.22 + 0.04 * bar, seed=10 + step), t, gain=0.65, pan=0.15)
        if step % 4 == 0:  # Downbeats (every 1.0 s)
            add(buf, sine_pulse(38, dur=0.65, vel=0.55), t, gain=0.8, pan=0.0)  # D2

    # --- ACT II: 8.0 - 16.0 s (Stripped to low pulse + 3 tension stings + silence at 15.3-16.0) ---
    for t in [8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0]:
        add(buf, sine_pulse(38, dur=0.5, vel=0.45), t, gain=0.7, pan=0.0)
    # Three detuned tension stings matching the 3 red callouts
    stings = [(10.0, 61, -18), (11.8, 60, +24), (13.6, 58, -32)]
    for t, midi, cents in stings:
        add(buf, marimba_sting(midi, vel=0.60, detune_cents=cents), t, gain=0.9, pan=-0.2)
        add(buf, marimba_sting(midi + 6, vel=0.45, detune_cents=-cents), t + 0.02, gain=0.8, pan=0.2)
    # 15.3 - 16.0 s: digital silence / breath!

    # --- ACT III: 16.0 - 27.0 s (Warm vibraphone chords, feature-cut glockenspiel, shaker) ---
    chords = [
        (16.0, [50, 57, 62, 65, 69]),  # Dm9
        (18.0, [46, 53, 62, 65, 69]),  # Bbmaj7
        (20.0, [48, 55, 60, 64, 67]),  # C
        (22.0, [45, 52, 60, 64, 67]),  # Am7
        (24.0, [50, 57, 62, 65, 69]),  # Dm9
        (25.5, [48, 55, 62, 64, 67]),  # Csus2/add9
    ]
    for t0, notes in chords:
        for i, m in enumerate(notes):
            add(buf, vibraphone(m, dur=1.8, vel=0.48), t0 + i * 0.02, gain=0.55, pan=(i - 2) * 0.15)
        add(buf, sine_pulse(notes[0] - 12, dur=0.8, vel=0.55), t0, gain=0.75, pan=0.0)

    # Feature-cut glockenspiel accents
    for t_cut, midi in [(16.0, 81), (18.0, 79), (20.2, 84), (22.6, 81), (24.1, 86), (25.5, 88)]:
        add(buf, glock_ping(midi, vel=0.42), t_cut, gain=0.75, pan=0.1)

    # Steady shaker 8ths in Act III
    t = 16.0
    idx = 0
    while t < 26.8:
        add(buf, shaker(vel=0.26, seed=200 + idx), t, gain=0.65, pan=-0.12 if idx % 2 == 0 else 0.12)
        t += 0.25
        idx += 1

    # --- ACT IV: 27.0 - 30.0 s (Resolve on warm Dadd9 chord, fade out cleanly) ---
    resolve_notes = [50, 57, 62, 66, 69, 76]  # D major add9
    for i, m in enumerate(resolve_notes):
        add(buf, vibraphone(m, dur=2.8, vel=0.52), 27.0 + i * 0.025, gain=0.55, pan=(i - 2.5) * 0.14)
    add(buf, sine_pulse(38, dur=2.2, vel=0.55), 27.0, gain=0.75, pan=0.0)

    # Gentle tail fade in last 0.4s
    fade_n = int(0.4 * SR)
    buf[-fade_n:] *= np.linspace(1.0, 0.0, fade_n)[:, None]

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sf.write(out_path, buf, SR)
    print(f"Score written to {out_path} ({DUR}s)")


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'score.wav')
    render_score(out)
