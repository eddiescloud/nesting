#!/usr/bin/env python3
"""把 score 渲染为参考 WAV：仅用于核验时间线可听、供排练预演，不作为最终音色。

标准库合成，与 score 完全确定性一致；时间线公式与增益上限不变，本轮只升级
合成层（失谐铺底、限带噪声颗粒、下滑脉冲、柔起泛音）。音色、空间化、现场
音量后续由 Scott 调整。播放端整体增益不得使峰值超过 1.0。
"""
import argparse
import array
import json
import math
import random
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '07-技术验证'))
import nesting  # 只复用读取与校验；不修改 07 的任何文件

SCORE_DIR = Path(__file__).resolve().parent
SAMPLE_RATE = 22050
GRAIN_MIN, GRAIN_MAX = 0.06, 0.15
BLOOM_SECONDS = 1.5
FADE_IN_SECONDS = 1.5
# 音色补充参数（首轮升级，仍为占位；不改变时间线与增益约定）
DRONE_BEAT_HZ = 0.4          # 铺底微失谐，产生缓慢拍频
DRONE_OCTAVE_WEIGHT = 0.25   # 八度泛音比例
GRAIN_NOISE_LP_HZ = 1200.0   # 颗粒限带噪声的一阶低通截止
PULSE_DROP_RATIO = 0.78      # 脉冲音高下滑比例（440 → ~345）
BLOOM_ATTACK = 0.04          # 泛音起音时长（秒）
BLOOM_GLIDE = 0.99           # 泛音轻微下坠


def grain_shape(u):
    return math.sin(math.pi * u) ** 2


def phase_start(score, phase_id):
    for phase in score['phases']:
        if phase['id'] == phase_id:
            return phase['start']
    raise nesting.Invalid('score 缺少相位 ' + phase_id)


def layer_by_id(score, layer_id):
    for layer in score['layers']:
        if layer['id'] == layer_id:
            return layer
    raise nesting.Invalid('score 缺少层 ' + layer_id)


def layer_envelope(layer, t, settle_start):
    """层包络：进入淡入；texture 层自 settle 相位起线性衰减到层结束。"""
    if t < layer['start'] or t >= layer['end']:
        return 0.0
    env = 1.0
    if t < layer['start'] + FADE_IN_SECONDS:
        env *= (t - layer['start']) / FADE_IN_SECONDS
    if layer['kind'] == 'texture' and settle_start is not None:
        fade = layer['end'] - settle_start
        if fade > 0 and t > settle_start:
            env *= max(0.0, (layer['end'] - t) / fade)
    return env


def add_tone(buf, start, count, freq, gain, shape):
    limit = len(buf)
    phase = 0.0
    step = 2.0 * math.pi * freq / SAMPLE_RATE
    for i in range(count):
        index = start + i
        if index >= limit:
            break
        buf[index] += gain * shape(i / count) * math.sin(phase)
        phase += step


def add_drone(buf, start, end, freq, gain):
    """失谐双正弦 + 八度泛音 + 呼吸式起伏；比单正弦更接近蜂群低鸣。"""
    limit = len(buf)
    step = 2.0 * math.pi * freq / SAMPLE_RATE
    beat_step = 2.0 * math.pi * DRONE_BEAT_HZ / SAMPLE_RATE
    octave_step = 2.0 * step
    phase = beat = octave = 0.0
    for index in range(start, end):
        if index >= limit:
            break
        t = index / SAMPLE_RATE
        env = 1.0
        if t < FADE_IN_SECONDS:
            env = t / FADE_IN_SECONDS
        elif t > 58.0:
            env = max(0.0, (60.0 - t) / 2.0)
        lfo = 1.0 + 0.2 * math.sin(2.0 * math.pi * 0.1 * t)
        base = math.sin(phase) + 0.35 * math.sin(beat)
        buf[index] += gain * env * lfo * (base + DRONE_OCTAVE_WEIGHT * math.sin(octave)) / 1.6
        phase += step
        beat += step + beat_step
        octave += octave_step


def add_noise_grain(buf, start, count, freq, gain, rng):
    """限带噪声 × 正弦载波（ring mod）+ 一阶低通：比纯正弦颗粒更像蜂群嗡鸣。"""
    limit = len(buf)
    alpha = 1.0 - math.exp(-2.0 * math.pi * GRAIN_NOISE_LP_HZ / SAMPLE_RATE)
    filtered = 0.0
    phase = 0.0
    step = 2.0 * math.pi * freq / SAMPLE_RATE
    for i in range(count):
        index = start + i
        if index >= limit:
            break
        noise = rng.uniform(-1.0, 1.0)
        filtered += alpha * (noise - filtered)
        buf[index] += gain * grain_shape(i / count) * filtered * math.sin(phase) * 1.8
        phase += step


def add_pitch_drop(buf, start, count, freq_from, freq_to, gain):
    """短促下滑脉冲：从 base 频率滑向低处，衰减包络，水滴感。"""
    limit = len(buf)
    phase = 0.0
    f0 = 2.0 * math.pi * freq_from / SAMPLE_RATE
    f1 = 2.0 * math.pi * freq_to / SAMPLE_RATE
    for i in range(count):
        index = start + i
        if index >= limit:
            break
        u = i / count
        step = f0 + (f1 - f0) * u
        env = math.sin(math.pi * min(1.0, u * 1.2)) * math.exp(-3.0 * u)
        buf[index] += gain * env * math.sin(phase)
        phase += step


def add_bloom(buf, start, count, base_freq, gain):
    """柔起泛音列 + 轻微下坠：每次沉积一次。"""
    limit = len(buf)
    attack = max(1, int(BLOOM_ATTACK * SAMPLE_RATE))
    for multiple, weight in ((1.0, 1.0), (1.5, 0.5), (2.0, 0.25)):
        freq = base_freq * multiple
        phase = 0.0
        for i in range(count):
            index = start + i
            if index >= limit:
                break
            u = i / count
            env = min(1.0, i / attack) * math.exp(-3.2 * u)
            buf[index] += gain * weight * env * math.sin(phase)
            phase += 2.0 * math.pi * freq * (BLOOM_GLIDE ** u) / SAMPLE_RATE


def render_samples(score, seconds=None):
    total = int(round((seconds if seconds is not None else score['duration_seconds']) * SAMPLE_RATE))
    buf = array.array('d', bytes(8 * total))
    seed = score['derived_from']['output_sha256']
    settle_start = phase_start(score, 'settle')

    for layer in score['layers']:
        rng = random.Random(seed + '|' + layer['id'])
        kind = layer['kind']
        if kind == 'drone':
            start_sample = int(layer['start'] * SAMPLE_RATE)
            end_sample = min(int(layer['end'] * SAMPLE_RATE), total)
            add_drone(buf, start_sample, end_sample, layer['base_frequency'], layer['gain'])
        elif kind == 'texture':
            span = layer['end'] - layer['start']
            for _ in range(int(layer['grain_rate'] * span)):
                t = rng.uniform(layer['start'] + 0.1, layer['end'] - 0.3)
                env = layer_envelope(layer, t, settle_start)
                if not env:
                    continue
                freq = layer['base_frequency'] * rng.uniform(0.88, 1.12)
                duration = GRAIN_MIN + (GRAIN_MAX - GRAIN_MIN) * rng.random()
                gain = layer['gain'] * env * rng.uniform(0.6, 1.0)
                add_noise_grain(buf, int(t * SAMPLE_RATE), int(duration * SAMPLE_RATE),
                                freq, gain, rng)
        elif kind == 'pulse':
            span = layer['end'] - layer['start']
            count = int(layer['grain_rate'] * span)
            spacing = span / count if count else 0
            for i in range(count):
                t = layer['start'] + (i + rng.uniform(0.1, 0.9)) * spacing
                freq = layer['base_frequency'] * rng.uniform(0.97, 1.03)
                add_pitch_drop(buf, int(t * SAMPLE_RATE), int(0.09 * SAMPLE_RATE),
                               freq, freq * PULSE_DROP_RATIO, layer['gain'])

    # 沉积事件：每次对应一次柔和泛音，供声音与视觉逐条对应。
    for event in score['events']:
        if event['cue'] != 'deposit' or event['gain'] <= 0:
            continue
        layer = layer_by_id(score, event['layer'])
        add_bloom(buf, int(event['t'] * SAMPLE_RATE), int(BLOOM_SECONDS * SAMPLE_RATE),
                  layer['base_frequency'], event['gain'])

    # master_gain 归一到总音量上限；防削波兜底只在异常峰值时触发。
    master = score['master_gain']
    peak = max((abs(value) for value in buf), default=0.0) * master
    if peak > 1.0:
        master *= 0.98 / peak
    for i in range(total):
        buf[i] *= master
    return buf


def write_wav(buf, path):
    pcm = array.array('h', (max(-32767, min(32767, int(value * 32767))) for value in buf))
    with wave.open(str(path), 'wb') as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(pcm.tobytes())


def main():
    parser = argparse.ArgumentParser(description='渲染 score 为参考 WAV')
    parser.add_argument('--score', type=Path,
                        default=SCORE_DIR / 'score.example-手工占位.json')
    parser.add_argument('--save', type=Path, help='输出 WAV 路径；不覆盖已存在文件')
    parser.add_argument('--seconds', type=float, help='仅渲染前 N 秒（快速试听用）')
    args = parser.parse_args()
    try:
        score = nesting.read(args.score)
        nesting.validate_schema(score, nesting.read(SCORE_DIR / 'score.schema.json'))
        buf = render_samples(score, args.seconds)
        peak = max((abs(value) for value in buf), default=0.0)
        if args.save:
            if args.save.exists():
                raise OSError('输出文件已存在')
            args.save.parent.mkdir(parents=True, exist_ok=True)
            write_wav(buf, args.save)
            print('已保存：' + str(args.save))
        print('时长 %.2f 秒，峰值 %.3f（master_gain %.4f）'
              % (len(buf) / SAMPLE_RATE, peak, score['master_gain']))
        return 0
    except nesting.Invalid as exc:
        print('未完成：' + str(exc), file=sys.stderr)
    except (OSError, UnicodeError) as exc:
        print('未完成：文件无法读取、已存在或无法写入（' + str(exc) + '）', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
