#!/usr/bin/env python3
"""Саундтрек для тизера OZ-TERMINAL: оригинальная музыка + звуки игры по журналу событий.

Использование: music.py events.json out.wav --trim 2.0 --dur 26.04 --offset -0.06
"""
import argparse
import json

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
rng = np.random.default_rng(7)


# ─── Базовые блоки ───────────────────────────────────
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def saw(f, dur):
    ph = np.cumsum(np.full(int(dur * SR), f) if np.isscalar(f) else f) / SR
    return 2 * (ph % 1) - 1


def square(f, dur, duty=0.5):
    ph = np.cumsum(np.full(int(dur * SR), f) if np.isscalar(f) else f) / SR
    return np.where(ph % 1 < duty, 1.0, -1.0)


def sine(f, dur):
    ph = np.cumsum(np.full(int(dur * SR), f) if np.isscalar(f) else f) / SR
    return np.sin(2 * np.pi * ph)


def tri(f, dur):
    ph = np.cumsum(np.full(int(dur * SR), f) if np.isscalar(f) else f) / SR
    return 2 * np.abs(2 * (ph % 1) - 1) - 1


def noise(dur):
    return rng.uniform(-1, 1, int(dur * SR))


def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, f, q=2.0):
    lo, hi = f / (1 + 1 / (2 * q)), f * (1 + 1 / (2 * q))
    return sosfilt(butter(2, [max(lo, 20), min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos'), x)


def env_exp(dur, decay):
    return np.exp(-t_axis(dur) / decay)


def adsr(dur, a=0.01, d=0.1, s=0.7, r=0.1):
    n = int(dur * SR)
    e = np.full(n, s)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na, endpoint=False) if na else e[:na]
    e[na:na + nd] = np.linspace(1, s, len(e[na:na + nd]), endpoint=False)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def sweep_lp(x, f_start, f_end, block=256):
    """Фильтр с плавно меняющейся частотой среза (по блокам с сохранением состояния)."""
    out = np.zeros_like(x)
    zi = None
    n = len(x)
    for i in range(0, n, block):
        fc = f_start * (f_end / f_start) ** (i / max(n - 1, 1))
        sos = butter(2, min(fc, SR / 2 - 100), 'low', fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + block], zi = sosfilt(sos, x[i:i + block], zi=zi)
    return out


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


class Bus:
    """Стереошина: add(сигнал, время, громкость, панорама)."""

    def __init__(self, dur):
        self.L = np.zeros(int(dur * SR) + SR)
        self.R = np.zeros_like(self.L)

    def add(self, x, at, gain=1.0, pan=0.0):
        i = int(at * SR)
        if i >= len(self.L) or i + len(x) <= 0:
            return
        if i < 0:
            x, i = x[-i:], 0
        x = x[: len(self.L) - i] * gain
        self.L[i:i + len(x)] += x * np.sqrt((1 - pan) / 2)
        self.R[i:i + len(x)] += x * np.sqrt((1 + pan) / 2)

    def stereo(self):
        return np.stack([self.L, self.R], axis=1)


def reverb(st, seconds=2.2, mix=0.25):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(st)
    for ch in range(2):
        ir = lp(rng.uniform(-1, 1, n), 5000) * np.exp(-t / (seconds / 4.5))
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        out[:, ch] = lp(fftconvolve(st[:, ch], ir)[: len(st)], 6000, 4)
    return st * (1 - mix) + out * mix


# ─── Звуки игры (как в audio.js) ─────────────────────
def sfx_scratch():
    return bp(noise(0.03), 2200 + rng.uniform(0, 1500), 3) * env_exp(0.03, 0.01) * 0.5


def sfx_tick():
    d = 0.03
    return (bp(noise(d), 1400 + rng.uniform(0, 400), 3) * env_exp(d, 0.006) * 1.2
            + tri(320 + rng.uniform(0, 60), d) * env_exp(d, 0.006) * 0.25)


def sfx_type():
    return bp(noise(0.02), 3500 + rng.uniform(0, 1500), 3) * env_exp(0.02, 0.004) * 0.9


def sfx_key():
    d = 0.04
    return bp(noise(d), 3500, 2) * env_exp(d, 0.006) * 0.8 + square(190, d) * env_exp(d, 0.004) * 0.08


def sfx_unlock():
    out = np.zeros(int(1.0 * SR))
    clunk = bp(noise(0.12), 700, 1.5) * env_exp(0.12, 0.025) * 2.2
    clunk2 = bp(noise(0.1), 400, 1.5) * env_exp(0.1, 0.03) * 2.0
    out[: len(clunk)] += clunk
    j = int(0.09 * SR)
    out[j:j + len(clunk2)] += clunk2
    for k, f in enumerate([523, 659, 784]):
        s = sine(f, 0.4) * env_exp(0.4, 0.12) * 0.35
        j = int((0.15 + k * 0.09) * SR)
        out[j:j + len(s)] += s
    return out


def sfx_denied():
    out = np.zeros(int(0.4 * SR))
    a = lp(square(220, 0.14), 2500) * adsr(0.14, 0.005, 0.05, 0.8, 0.03) * 0.22
    b = lp(square(165, 0.2), 2500) * adsr(0.2, 0.005, 0.05, 0.8, 0.05) * 0.22
    out[: len(a)] += a
    j = int(0.13 * SR)
    out[j:j + len(b)] += b
    return out


def sfx_granted():
    out = np.zeros(int(0.6 * SR))
    for k, f in enumerate([784, 988, 1175]):
        s = lp(square(f, 0.12), 4000) * adsr(0.12, 0.005, 0.04, 0.6, 0.04) * 0.16
        j = int(k * 0.08 * SR)
        out[j:j + len(s)] += s
    return out


# ─── Музыка ──────────────────────────────────────────
def kick(gain=1.0):
    d = 0.35
    f = 110 * np.exp(-t_axis(d) / 0.04) + 42
    return sine(f, d) * env_exp(d, 0.12) * gain


def snare():
    d = 0.22
    return (hp(noise(d), 1200) * env_exp(d, 0.06) * 0.6 + sine(190, d) * env_exp(d, 0.04) * 0.3)


def hat(open_=False):
    d = 0.12 if open_ else 0.04
    return hp(noise(d), 7000) * env_exp(d, 0.05 if open_ else 0.012) * 0.35


def impact():
    d = 2.0
    boom = sine(46 * np.exp(-t_axis(d) / 0.9) + 30, d) * env_exp(d, 0.5)
    crash = lp(hp(noise(d), 3000), 12000) * env_exp(d, 0.35) * 0.3
    return boom * 0.55 + crash


def build(events, dur, trim, offset):
    bus = Bus(dur)        # музыка
    sfx = Bus(dur)        # звуки игры

    def vt(ms):           # время события в секундах готового ролика
        return ms / 1000 + offset - trim

    t0 = events['t0']
    ev = [(e['n'], vt(e['t'] - t0)) for e in events['ev']]
    st = [dict(s, tt=vt(s['t'] - t0)) for s in events['st']]

    t_unlock = next(t for n, t in ev if n == 'unlock')
    t_granted = next(t for n, t in ev if n == 'granted')
    t_win = next(t for n, t in ev if n == 'win')
    jam = [s['tt'] for s in st if s['j']]
    jam_a, jam_b = (min(jam), max(jam)) if jam else (None, None)

    # ── Секция A: напряжение (до открытия замка) ──
    A = t_unlock
    drone_f = midi(33)  # A1
    drone = saw(drone_f, A + 0.5) + saw(drone_f * 1.006, A + 0.5) * 0.8
    drone = sweep_lp(drone, 140, 700) * adsr(A + 0.5, 1.2, 0.1, 1.0, 0.5) * 0.10
    bus.add(drone, 0, 1.0, -0.1)
    pad = sum(saw(midi(n), A + 0.4) for n in (45, 48, 52)) / 3
    pad = lp(pad, 900) * adsr(A + 0.4, 1.5, 0.2, 1.0, 0.4) * 0.07
    bus.add(pad, 0, 1.0, 0.15)
    beat = 0.5
    k = 0.5
    while k < A - 0.05:
        bus.add(kick(0.55), k)
        k += beat
    h = 1.5
    while h < A - 0.05:
        bus.add(hat(), h, 0.35 if int(h * 4) % 2 else 0.2, 0.3)
        h += beat / 2
    if jam_a is not None:
        dj = jam_b - jam_a + 0.25
        f = midi(76) * (1 + 0.06 * t_axis(dj) / dj)  # диссонирующий нарастающий тон
        tension = (saw(f, dj) + saw(f * 1.06, dj)) * 0.5
        tension = lp(tension, 3000) * adsr(dj, 0.15, 0.1, 1.0, 0.15) * 0.05
        bus.add(tension, jam_a, 1.0, -0.3)

    # ── Удар на открытии ──
    bus.add(impact(), t_unlock, 0.38)

    # ── Секция B: движение (терминал) ──
    B0, B1 = t_unlock, t_win
    bar = 2.0
    prog = [(45, [57, 60, 64]), (41, [53, 57, 60]), (48, [55, 60, 64]), (43, [55, 59, 62])]  # Am F C G
    bass_pat = [0, 0, 12, 0, 0, 10, 12, 7]
    t = B0
    step = 0
    while t < B1 - 0.01:
        rel = (t - B0) / (B1 - B0)
        bi = int((t - B0) // bar) % 4
        root, chord = prog[bi]
        pos8 = step % 8
        # бас восьмыми
        n = root - 12 + bass_pat[pos8]
        d = 0.24
        bs = lp(saw(midi(n), d) + square(midi(n) / 2, d) * 0.5, 300 + 900 * rel) * adsr(d, 0.004, 0.08, 0.6, 0.05)
        bus.add(bs, t, 0.16)
        # барабаны
        if pos8 % 4 == 0:
            bus.add(kick(0.8), t)
        if pos8 % 4 == 2:
            bus.add(snare(), t, 0.5, 0.05)
        bus.add(hat(open_=(pos8 % 2 == 1)), t, 0.17, 0.35)
        bus.add(hat(), t + 0.125, 0.12, 0.35)
        # арпеджио шестнадцатыми
        for s16 in range(2):
            ta = t + s16 * 0.125
            note = chord[(step * 2 + s16) % 3] + (12 if (step * 2 + s16) % 6 >= 3 else 0)
            d = 0.12
            ar = lp(square(midi(note), d, 0.3), 900 + 3500 * rel) * adsr(d, 0.003, 0.05, 0.4, 0.04)
            pan = -0.4 if s16 == 0 else 0.4
            bus.add(ar, ta, 0.07, pan)
            bus.add(ar, ta + 0.375, 0.025, -pan)  # эхо
        step += 1
        t += 0.25
    # подъём перед финалом
    rise_d = B1 - t_granted
    if rise_d > 0.3:
        riser = sweep_lp(hp(noise(rise_d), 400), 600, 9000) * np.linspace(0, 1, int(rise_d * SR)) ** 2 * 0.22
        bus.add(riser, t_granted, 1.0)

    # ── Секция C: финал ──
    C = dur - B1
    bus.add(impact(), B1, 0.32)
    chord = [57, 61, 64, 69, 73]  # A мажор
    padc = sum(saw(midi(n), C) + saw(midi(n) * 1.004, C) for n in chord) / 10
    padc = lp(padc, 2500) * adsr(C, 0.05, 0.6, 0.6, C * 0.6) * 0.10
    bus.add(padc, B1, 1.0)
    bassc = sine(midi(33), C) * adsr(C, 0.02, 0.5, 0.7, C * 0.6) * 0.24
    bus.add(bassc, B1)
    for i, n in enumerate([69, 73, 76, 81, 85, 88]):
        bell = (sine(midi(n), 1.6) + 0.4 * sine(midi(n) * 2.01, 1.6)) * env_exp(1.6, 0.5) * 0.06
        bus.add(bell, B1 + 0.15 + i * 0.14, 1.0, -0.5 + i * 0.2)

    # ── Пульс до призыва и акцент на призыве ──
    t_cta = next((t for n, t in ev if n == 'cta'), None)
    if t_cta is not None:
        k = B1 + 1.0
        while k < t_cta - 0.05:
            bus.add(kick(0.3), k)
            bus.add(hat(), k + 0.25, 0.1, 0.3)
            k += 0.5
        bus.add(impact(), t_cta, 0.32)
        Ccta = dur - t_cta
        hi = [69, 73, 76, 81]  # A мажор выше
        padh = sum(saw(midi(n), Ccta) + saw(midi(n) * 1.005, Ccta) for n in hi) / 8
        padh = lp(padh, 3200) * adsr(Ccta, 0.4, 0.5, 0.8, Ccta * 0.5) * 0.17
        bus.add(padh, t_cta, 1.0)
        bus.add(sine(midi(45), Ccta) * adsr(Ccta, 0.05, 0.6, 0.7, Ccta * 0.5) * 0.28, t_cta)
        for i, n in enumerate([81, 85, 88, 93, 88, 85, 81]):
            bell = (sine(midi(n), 1.4) + 0.4 * sine(midi(n) * 2.01, 1.4)) * env_exp(1.4, 0.45) * 0.055
            bus.add(bell, t_cta + 0.2 + i * 0.16, 1.0, -0.6 + i * 0.2)

    # ── Звуки игры ──
    gens = {'scratch': sfx_scratch, 'tick': sfx_tick, 'type': sfx_type, 'key': sfx_key,
            'unlock': sfx_unlock, 'denied': sfx_denied, 'granted': sfx_granted,
            'caption': sfx_type, 'click': lambda: sine(950, 0.04) * env_exp(0.04, 0.01) * 0.4}
    gains = {'scratch': 0.5, 'tick': 0.8, 'type': 0.45, 'key': 0.5, 'unlock': 0.5, 'denied': 0.9, 'granted': 0.9,
             'caption': 0.38, 'click': 0.8}
    for n, tt in ev:
        if n in gens and 0 <= tt < dur:
            sfx.add(gens[n](), tt, gains[n], rng.uniform(-0.15, 0.15))

    # Скрежет при заклинивании и тон натяжения — по кадрам состояния
    grind = np.zeros(int(dur * SR) + SR)
    sq = np.zeros_like(grind)
    turn = np.zeros_like(grind)
    for a, b in zip(st, st[1:]):
        i0, i1 = int(max(a['tt'], 0) * SR), int(max(b['tt'], 0) * SR)
        if i1 <= i0 or i0 >= len(grind):
            continue
        n = i1 - i0
        if a['j']:
            fc = 260 + a['w'] * 6
            lfo = 1 + 0.4 * np.sin(2 * np.pi * 13 * (np.arange(i0, i1) / SR))
            seg = bp(noise(n / SR + 0.01)[:n], fc, 4) * lfo * (0.35 + a['w'] / 300)
            grind[i0:i1] += seg[:n]
            if a['w'] > 45:
                sq[i0:i1] += tri(1500 + a['w'] * 12, n / SR + 0.01)[:n] * (a['w'] - 45) / 55 * 0.025
        elif a['tr']:
            turn[i0:i1] += lp(saw(40 + a['rot'] * 0.9, n / SR + 0.01), 380)[:n] * 0.05
    sfx.L += (grind * 1.2 + sq + turn) * 0.75
    sfx.R += (grind * 1.2 + sq + turn) * 0.75

    music = reverb(bus.stereo(), 2.4, 0.22)
    sounds = reverb(sfx.stereo(), 1.0, 0.12)
    mix = music * 0.85 + sounds * 1.0
    mix = mix[: int(dur * SR)]
    # мягкое затухание в конце
    fade = int(0.8 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    mix /= np.max(np.abs(mix)) + 1e-9
    return mix * 0.9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('events')
    ap.add_argument('out')
    ap.add_argument('--trim', type=float, required=True)
    ap.add_argument('--dur', type=float, required=True)
    ap.add_argument('--offset', type=float, default=0.0)
    a = ap.parse_args()
    events = json.load(open(a.events))
    mix = build(events, a.dur, a.trim, a.offset)
    wavfile.write(a.out, SR, (mix * 32767).astype(np.int16))


if __name__ == '__main__':
    main()
