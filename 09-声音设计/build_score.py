#!/usr/bin/env python3
"""从符合 output.schema 的转译输出确定性推导 60 秒音画同步时间线（score）。

时间结构来自 02-体验与分镜；参数映射来自 03-蜂群与融合规则。不调用模型；
相同输出必得相同 score（可复算、可审计）。视觉与声音都必须消费本文件
产出的 phases 与 events，不得各自硬编码时间。占位来源不得冒充真实 AI 结果。
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '07-技术验证'))
import nesting  # 只复用读取与校验；不修改 07 的任何文件

AI = ROOT / '04-AI转译'
SCORE_DIR = Path(__file__).resolve().parent
DURATION = 60.0
LOUDNESS_CAP = 0.8
SWARM_COUNT = 48

# 时间结构来自 02-体验与分镜；视觉与声音共用同一组相位。
PHASES = [
    ('calm', 0, 8, '静置'),
    ('swarm-a', 8, 20, '第一组进入'),
    ('swarm-b', 20, 32, '第二组进入'),
    ('weave', 32, 47, '交织'),
    ('settle', 47, 57, '沉积'),
    ('residual', 57, 60, '存留'),
]

# 首轮起点（03）：声音仅随 energy 调整纹理密度；增益与音区为占位混音，现场可调。
TEXTURE_RATE_BASE, TEXTURE_RATE_SPAN = 2.0, 14.0
GAIN_BED, GAIN_SWARM, GAIN_PULSE, GAIN_BLOOM = 0.15, 0.28, 0.22, 0.30


def r4(value):
    """保留四位小数；舍入为 half-up，与 audio.mjs 的 r4 完全同解。

    不使用内置 round(value, 4)：那是银行家舍入，而 JS 端为 Math.round(x*1e4)/1e4
    （half-up），第五位恰为 5 时两端会得到不同数值，破坏跨语言一致性。
    """
    return math.floor(float(value) * 1e4 + 0.5) / 1e4


def r4_floor(value):
    """master_gain 用向下取整，避免舍入后略微超出总音量上限。"""
    return math.floor(float(value) * 1e4) / 1e4


def round_half_up(value):
    """与 JS Math.round 语义一致的取整：.5 一律进位（输入为非负数）。

    Python 内置 round 是银行家舍入（round-half-to-even）：48×0.46875 = 22.5 会得到 22，
    而视觉 weave.js 与声音 audio.mjs 用 Math.round 得到 23，导致结对数与沉积节拍
    跨端失配（沉积事件逐条对应视觉沉积粒子）。此函数是本项目取整的唯一实现，
    修改须同步 config.js / weave.js / audio.mjs 的同名函数。
    """
    return math.floor(float(value) + 0.5)


def sha_of(output):
    text = json.dumps(output, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def peak_concurrent(layers):
    """持续层在不同时段的并发增益峰值，用于 master_gain 归一。"""
    points = sorted({0.0, DURATION} | {item['start'] for item in layers} | {item['end'] for item in layers})
    peak = 0.0
    for left, right in zip(points, points[1:]):
        if right <= left:
            continue
        middle = (left + right) / 2
        peak = max(peak, sum(item['gain'] for item in layers
                             if item['start'] <= middle <= item['end']))
    return peak


def build(output, source_label):
    first, second = output['events']
    weave = output['interaction']['weave']
    settle = output['interaction']['settle']
    # 03：前 round(48 × weave) 个粒子结对；沉积对数为 round(结对数 × settle)。
    # 取整统一走 round_half_up，与视觉/声音运行时的 Math.round 一致。
    pairs = round_half_up(SWARM_COUNT * weave)
    deposits = round_half_up(pairs * settle)

    layers = [
        {'id': 'bed', 'kind': 'drone', 'source_event': 'none',
         'start': 0, 'end': DURATION, 'base_frequency': 55, 'grain_rate': 0,
         'gain': GAIN_BED},
        {'id': 'swarm-a', 'kind': 'texture', 'source_event': first['id'],
         'start': 8, 'end': 57, 'base_frequency': 220,
         'grain_rate': r4(TEXTURE_RATE_BASE + TEXTURE_RATE_SPAN * first['energy']),
         'gain': GAIN_SWARM},
        {'id': 'swarm-b', 'kind': 'texture', 'source_event': second['id'],
         'start': 20, 'end': 57, 'base_frequency': 330,
         'grain_rate': r4(TEXTURE_RATE_BASE + TEXTURE_RATE_SPAN * second['energy']),
         'gain': GAIN_SWARM},
        {'id': 'weave-pulse', 'kind': 'pulse', 'source_event': 'none',
         'start': 32, 'end': 47, 'base_frequency': 440,
         'grain_rate': r4(0.5 + 1.5 * weave), 'gain': GAIN_PULSE},
        {'id': 'settle-bloom', 'kind': 'bloom', 'source_event': 'none',
         'start': 47, 'end': 57, 'base_frequency': 275, 'grain_rate': 0,
         'gain': GAIN_BLOOM},
    ]
    for item in layers:
        item['start'] = r4(item['start'])
        item['end'] = r4(item['end'])

    events = [
        {'id': 'cue-01', 't': 0, 'layer': 'bed', 'cue': 'showcase-start', 'gain': 0},
        {'id': 'cue-02', 't': 8, 'layer': 'swarm-a', 'cue': 'swarm-a-enter', 'gain': 0},
        {'id': 'cue-03', 't': 20, 'layer': 'swarm-b', 'cue': 'swarm-b-enter', 'gain': 0},
        {'id': 'cue-04', 't': 32, 'layer': 'weave-pulse', 'cue': 'weave-start', 'gain': 0},
        {'id': 'cue-05', 't': 47, 'layer': 'settle-bloom', 'cue': 'settle-start', 'gain': 0},
        {'id': 'cue-06', 't': 57, 'layer': 'bed', 'cue': 'residual-start', 'gain': 0},
    ]
    for index in range(deposits):
        t = 47 + (index + 0.5) * 10.0 / deposits if deposits else 0
        events.append({'id': 'deposit-%02d' % (index + 1), 't': r4(t),
                       'layer': 'settle-bloom', 'cue': 'deposit', 'gain': GAIN_BLOOM})

    return {
        'version': '0.1',
        'duration_seconds': 60,
        'master_gain': r4_floor(min(1.0, LOUDNESS_CAP / peak_concurrent(layers))),
        'derived_from': {'output_sha256': sha_of(output), 'source': source_label},
        'phases': [{'id': pid, 'start': r4(start), 'end': r4(end), 'label': label}
                   for pid, start, end, label in PHASES],
        'layers': layers,
        'events': events,
        'notes': '由 build_score.py 按 02 分镜与 03 规则的固定公式从转译输出推导；'
                 '数值为首轮起点，音色与现场音量另行调整。占位来源不冒充真实 AI 结果。',
    }


def load_output(path, source_path=None):
    output = nesting.read(path)
    nesting.validate_schema(output, nesting.read(AI / 'output.schema.json'))
    if source_path is not None:
        # 同时核对事件 ID 与顺序与原始两段话输入一致。
        nesting.validate_output(output, nesting.read(source_path))
    return output


def main():
    parser = argparse.ArgumentParser(description='推导音画同步时间线 score')
    parser.add_argument('--output', type=Path, default=AI / 'output.example-手工占位.json')
    parser.add_argument('--input', type=Path, help='可选：原始两段话输入，用于核对事件 ID 与顺序')
    parser.add_argument('--source-label', default='未标注来源')
    parser.add_argument('--save', type=Path, help='显式保存；不覆盖已存在文件')
    args = parser.parse_args()
    try:
        output = load_output(args.output, args.input)
        score = build(output, args.source_label)
        nesting.validate_schema(score, nesting.read(SCORE_DIR / 'score.schema.json'))
        if args.save:
            with args.save.open('x', encoding='utf-8') as file:
                json.dump(score, file, ensure_ascii=False, indent=2)
            print('已保存：' + str(args.save))
        else:
            print(json.dumps(score, ensure_ascii=False, indent=2))
        return 0
    except (nesting.Invalid, nesting.ConnectionFailure) as exc:
        print('未完成：' + str(exc), file=sys.stderr)
    except (OSError, UnicodeError):
        print('未完成：文件无法读取、已存在或无法写入', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
