#!/usr/bin/env python3
"""10-语言解码：把一句转写文本解码成一只蜂的结构，并产出可复算的对应表。

分层（与 09-声音设计 同一思路）：
  模型只给语义 —— tone / meaning / segments；
  蜂体参数由本文件的确定性公式派生 —— 同一份 decode 永远得到同一只蜂；
  每个派生值都写入 trace，可逐项核对，不靠人工解读。

模型传输复用 07-技术验证/nesting.py 的加固通道（子进程隔离、8 秒总超时、
禁止重定向、响应限长、失败重试一次、绝不回显密钥与响应体）。
本文件不读取、不保存任何密钥：密钥只能来自环境变量。
"""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = Path(__file__).resolve().parent

_spec = importlib.util.spec_from_file_location('nesting_validator', ROOT / '07-技术验证/nesting.py')
nesting = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nesting)

Invalid = nesting.Invalid
ConnectionFailure = nesting.ConnectionFailure

SCHEMA = MODULE / 'decode.schema.json'
PROMPT = MODULE / '解码提示词.md'
PLACEHOLDER = MODULE / 'examples/decode.example-手工占位.json'

# 词表：与 解码提示词.md 必须逐字一致，模型越界即判失败（不允许自由发挥）
TONE_LABELS = ('平稳', '急促', '迟疑', '压抑', '轻快', '沉重', '克制', '激动', '疏离', '温和')
ROLES = ('head', 'wing', 'thorax', 'abdomen', 'stinger')
DIRECTIONS = ('inward', 'outward', 'neutral')

MAX_TRANSCRIPT = 120   # 与 validate_input 的原话上限一致
MAX_UNITS = 32         # 与 web/visual/js/config.js 的 BEE.maxCharacters 对齐

# 蜂体几何基准：与 web/visual/js/config.js 的 BEE 同源，改一处须同步另一处
BEE_BASE = {'bodyWidth': 250, 'bodyHeight': 190}


def clamp01(value):
    return max(0.0, min(1.0, float(value)))


def r4(value):
    """四位小数 half-up，与 build_score.r4 / audio.mjs 的 r4 同解。"""
    return math.floor(float(value) * 1e4 + 0.5) / 1e4


def text_of(decoded):
    """去掉空白后的原话，用于段落拼接核对。"""
    return ''.join(str(decoded.get('transcript', '')).split())


def prune_to_schema(value, schema, dropped=None):
    """按 schema 递归剥离未声明字段：只删多余键，不补缺失键、不改写取值。

    模型偶尔会自作主张增加说明性字段（实测出现过 meaning.weight_note），
    这些字段不参与蜂体派生，却会让 additionalProperties:false 的校验直接失败，
    白白消耗一次重试并在现场表现为「解码失败」。剥离后仍然缺字段、越界或词表外，
    照旧判失败——严格性没有降低，只是不再为无害的附加说明买单。
    """
    if dropped is None:
        dropped = []
    if not isinstance(schema, dict):
        return value
    kind = schema.get('type')
    if kind == 'object' and isinstance(value, dict):
        props = schema.get('properties') or {}
        if schema.get('additionalProperties') is False:
            for key in list(value):
                if key not in props:
                    dropped.append(key)
                    value.pop(key)
        for key, sub in props.items():
            if key in value:
                value[key] = prune_to_schema(value[key], sub, dropped)
        return value
    if kind == 'array' and isinstance(value, list) and isinstance(schema.get('items'), dict):
        return [prune_to_schema(item, schema['items'], dropped) for item in value]
    return value


def validate_decode(decoded, transcript=None):
    """结构校验 + 词表校验 + 与原话逐字一致性校验。"""
    nesting.validate_schema(decoded, nesting.read(SCHEMA))

    if len(decoded['transcript']) > MAX_TRANSCRIPT:
        raise Invalid('原话超过 ' + str(MAX_TRANSCRIPT) + ' 字')
    if transcript is not None and text_of(decoded) != ''.join(str(transcript).split()):
        raise Invalid('解码结果与转写文本不一致')

    if decoded['tone']['label'] not in TONE_LABELS:
        raise Invalid('语气标签不在词表内')
    if decoded['meaning']['direction'] not in DIRECTIONS:
        raise Invalid('方向不在词表内')
    for segment in decoded['segments']:
        if segment['role'] not in ROLES:
            raise Invalid('分段角色不在词表内')

    joined = ''.join(segment['text'] for segment in decoded['segments'])
    if ''.join(joined.split()) != text_of(decoded):
        raise Invalid('分段按顺序拼接后与原话不一致')
    if sum(1 for char in joined if not char.isspace()) > MAX_UNITS:
        raise Invalid('分段展开后超过 ' + str(MAX_UNITS) + ' 个文字单元')
    return decoded


# 语气基准色相：十种语气在暖色主调内拉开可辨距离，唯一冷色留给「疏离」。
# 取值理由见 docs/DECISIONS.md「语气基准色相与姿态」：原公式只由 direction 决定色相，
# 实测十句不同语气挤在 50–55 度，观众分辨不出「这只蜂由那句话长成」。
TONE_HUE = {'急促': 22.0, '激动': 14.0, '轻快': 56.0, '温和': 64.0, '平稳': 45.0,
            '迟疑': 50.0, '克制': 36.0, '沉重': 26.0, '压抑': 30.0, '疏离': 205.0}

# 语气主导姿态：收拢型语气即便判为向外，也应向内蜷；外放型则张开。
TONE_POSTURE = {'压抑': 'curl', '克制': 'curl', '沉重': 'curl', '疏离': 'curl',
                '激动': 'open', '急促': 'open', '轻快': 'open'}


def _hue(label, direction, intensity):
    """色相 = 语气基准 + 方向微调 + 强度微调。

    基准由语气标签给出（十种语气彼此可辨），方向与强度只做 ±6 度内的修正，
    避免再次出现「不同语气同一个颜色」。
    """
    base = TONE_HUE.get(label, 45.0)
    shift = {'inward': -6.0, 'outward': 6.0, 'neutral': 0.0}.get(direction, 0.0)
    return r4(base + shift + (intensity - 0.5) * 6.0)


def _posture(label, direction, intensity):
    """姿态 = 语气主导，方向兜底。

    原实现只看 direction，而模型几乎恒判 outward，导致八句里七句都是 open。
    """
    if label in TONE_POSTURE:
        return TONE_POSTURE[label]
    if direction == 'inward':
        return 'curl'
    if direction == 'outward':
        return 'open' if intensity >= 0.65 else 'level'
    return 'level'


def derive(decoded):
    """由语义确定性派生出蜂体规格与逐项对应表。"""
    validate_decode(decoded)
    tone = decoded['tone']
    meaning = decoded['meaning']
    intensity = clamp01(tone['intensity'])
    pace = clamp01(tone['pace'])
    weight = clamp01(meaning['weight'])

    wingbeat = r4(1.6 + 1.8 * intensity)
    tension = r4(clamp01(0.5 * intensity + 0.5 * weight))
    spacing = r4(0.7 + 0.6 * (1.0 - pace))
    hue = _hue(tone['label'], meaning['direction'], intensity)
    body_scale = r4(0.85 + 0.30 * weight)

    units = []
    trace = []
    for index, segment in enumerate(decoded['segments']):
        chars = [char for char in segment['text'] if not char.isspace()]
        start = len(units)
        for char in chars:
            units.append({'i': len(units), 'char': char, 'role': segment['role'],
                          'segment': index, 'weight': r4(segment['weight'])})
        if chars:
            trace.append({
                'from': 'segments[' + str(index) + "].text=「" + segment['text'] + '」role=' + segment['role'],
                'to': 'units[' + str(start) + '..' + str(len(units) - 1) + ']（' + segment['role'] + ' 部位）',
                'rule': '分段按原句顺序逐字展开为单元，单元继承该段角色与权重',
            })

    if len(units) > MAX_UNITS:
        raise Invalid('文字单元超过上限')

    bee = {
        'wingbeatHz': wingbeat,
        'tension': tension,
        'spacing': spacing,
        'hue': hue,
        'posture': _posture(tone['label'], meaning['direction'], intensity),
        'bodyScale': body_scale,
        'bodyWidth': r4(BEE_BASE['bodyWidth'] * body_scale),
        'bodyHeight': r4(BEE_BASE['bodyHeight'] * body_scale),
        'segmentCount': len(units),
    }
    trace.extend([
        {'from': 'tone.intensity=' + str(intensity), 'to': 'bee.wingbeatHz=' + str(wingbeat),
         'rule': '1.6 + 1.8 × 语气强度（翅膀振动快慢）'},
        {'from': 'tone.intensity=' + str(intensity) + ' / meaning.weight=' + str(weight),
         'to': 'bee.tension=' + str(tension), 'rule': '0.5 × 语气强度 + 0.5 × 分量（体节绷紧程度）'},
        {'from': 'tone.pace=' + str(pace), 'to': 'bee.spacing=' + str(spacing),
         'rule': '0.7 + 0.6 × (1 − 节奏)（说得越慢，体节越松）'},
        {'from': 'tone.label=' + tone['label'] + ' / meaning.direction=' + meaning['direction']
                 + ' / tone.intensity=' + str(intensity),
         'to': 'bee.hue=' + str(hue),
         'rule': '语气基准色相（' + str(TONE_HUE.get(tone['label'], 45.0)) + '）+ 方向微调（向内 −6 / 向外 +6 / 中性 0）+ (强度 − 0.5) × 6'},
        {'from': 'tone.label=' + tone['label'] + ' / meaning.direction=' + meaning['direction']
                 + ' / tone.intensity=' + str(intensity),
         'to': 'bee.posture=' + bee['posture'],
         'rule': '语气主导（收拢语气 curl / 外放语气 open），语气未定时按方向：向内 curl / 向外且强度 ≥ 0.65 为 open，其余 level'},
        {'from': 'meaning.weight=' + str(weight), 'to': 'bee.bodyScale=' + str(body_scale),
         'rule': '0.85 + 0.30 × 分量（分量越重，蜂越大）'},
        {'from': 'segments 的 role 分布', 'to': 'bee.segmentCount=' + str(len(units)),
         'rule': '每个非空白字符成为一个腹部/头部/胸部/翅/尾单元，上限 ' + str(MAX_UNITS)},
    ])
    return {'version': '0.1', 'units': units, 'bee': bee,
            'geometryBase': dict(BEE_BASE), 'trace': trace}


NEUTRAL_BEE = {'wingbeatHz': 2.2, 'tension': 0.5, 'spacing': 1.0, 'hue': 38.0,
               'posture': 'level', 'bodyScale': 1.0}


def derive_undecoded(transcript):
    """模型未接入时的诚实降级：只做文字结构拆分，绝不编造语气与含义。"""
    text = str(transcript or '').strip()
    if not text:
        raise Invalid('缺少转写文本')
    if len(text) > MAX_TRANSCRIPT:
        raise Invalid('原话超过 ' + str(MAX_TRANSCRIPT) + ' 字')
    chars = [char for char in text if not char.isspace()]
    if len(chars) > MAX_UNITS:
        raise Invalid('文字单元超过上限')

    units = [{'i': i, 'char': char, 'role': 'abdomen', 'segment': 0, 'weight': 0.5}
             for i, char in enumerate(chars)]
    bee = dict(NEUTRAL_BEE)
    bee['bodyWidth'] = r4(BEE_BASE['bodyWidth'] * bee['bodyScale'])
    bee['bodyHeight'] = r4(BEE_BASE['bodyHeight'] * bee['bodyScale'])
    bee['segmentCount'] = len(units)
    trace = [{'from': 'transcript（未解码）', 'to': 'units[0..' + str(max(0, len(units) - 1)) + ']',
              'rule': '每个非空白字符成为一个单元；语气与含义未解码，全部按腹部单元处理'},
             {'from': '（无语气/含义输入）', 'to': 'bee 全部字段',
              'rule': '使用中性默认值 ' + json.dumps(NEUTRAL_BEE, ensure_ascii=False) + '，不代表任何语气判断'}]
    return {'version': '0.1', 'decoded': False,
            'notice': '未接入语言模型：仅按文字结构拆出单元，语气与含义没有解码，蜂体为中性默认值',
            'units': units, 'bee': bee, 'geometryBase': dict(BEE_BASE), 'trace': trace}


DEFAULT_SOURCE_LABEL = 'examples/decode.example-手工占位.json'


def demo_result():
    """占位示例的完整结果；CLI 的 demo 模式与映射表防漂移测试共用同一实现。"""
    decoded = nesting.read(PLACEHOLDER)
    derived = derive(decoded)
    return {'mode': 'demo', 'notice': '手工占位解码，未调用模型', 'decode': decoded,
            'units': derived['units'], 'bee': derived['bee'], 'trace': derived['trace']}


def provenance_note(result):
    """证据文件顶部的来源说明。

    必须如实区分人工占位与真实模型结果——把 live 结果标成"未调用模型"，
    等于用占位冒充模型输出，是项目明令禁止的。
    """
    mode = result.get('mode')
    if mode == 'live':
        model = result.get('model_requested') or result.get('model') or '模型'
        attempts = result.get('attempts')
        if attempts == 1:
            extra = '，一次通过'
        elif attempts:
            extra = '，重试 ' + str(attempts - 1) + ' 次后通过'
        else:
            extra = ''
        return '由 ' + str(model) + ' 实时解码' + extra + '（语气与含义是模型判断，可被否定）'
    if mode == 'demo':
        return '人工占位示例，未调用模型'
    if mode in ('imported', 'derived'):
        return '导入的解码结果，来源与语义未验证'
    if mode == 'undecoded':
        return '未接入语言模型：只做文字结构拆分，语气与含义未解码'
    return '来源未标注（不得当作模型结果使用）'


def trace_markdown(result, source_label=DEFAULT_SOURCE_LABEL):
    """把派生结果渲染成逐项对应表。

    这是映射表的唯一生成实现：CLI 的 --md 与 test_decode 的防漂移测试都调用它，
    因此「文档与公式不一致」会直接让测试失败，而不是悄悄过期。
    """
    decoded = result.get('decode')
    bee = result['bee']
    units = result['units']
    lines = ['# 文字结构 → 蜂体 映射表（自动生成）', '',
             '> 本文件由 ' + chr(96) + '10-语言解码/derive_bee.py' + chr(96) + ' 的 trace 生成，不要手改。',
             '> **来源：' + provenance_note(result) + '**',
             '> 输入：' + chr(96) + source_label + chr(96),
             '> 重新生成：' + chr(96) + 'python3 10-语言解码/derive_bee.py '
             + str(result.get('mode') or 'demo') + ' --md <输出路径>' + chr(96), '']

    lines += ['## 1. 原话与语义输入', '']
    if decoded is None:
        lines += ['本次解码未经模型（' + str(result.get('notice', '')) + '），因此没有语气与含义输入。', '']
    else:
        lines += ['| 字段 | 值 |', '|---|---|',
                  '| transcript | ' + decoded['transcript'] + ' |',
                  '| tone.label | ' + decoded['tone']['label'] + ' |',
                  '| tone.intensity | ' + str(decoded['tone']['intensity']) + ' |',
                  '| tone.pace | ' + str(decoded['tone']['pace']) + ' |',
                  '| tone.evidence | ' + decoded['tone']['evidence'] + ' |',
                  '| meaning.gist | ' + decoded['meaning']['gist'] + ' |',
                  '| meaning.direction | ' + decoded['meaning']['direction'] + ' |',
                  '| meaning.weight | ' + str(decoded['meaning']['weight']) + ' |',
                  '| uncertainty | ' + decoded['uncertainty'] + ' |', '']

    lines += ['## 2. 分段到部位', '', '| 原句分段 | role（部位） | weight | 展开出的字符单元 |', '|---|---|---|---|']
    if decoded is None:
        lines += ['| ' + ''.join(u['char'] for u in units) + ' | （未解码，全部按腹部单元） | 0.5 | 第 0–' + str(max(0, len(units) - 1)) + ' 单元 |']
    else:
        for index, segment in enumerate(decoded['segments']):
            idx = [u['i'] for u in units if u['segment'] == index]
            span = ('第 ' + str(idx[0]) + '–' + str(idx[-1]) + ' 单元') if idx else '（无）'
            lines.append('| ' + segment['text'] + ' | ' + segment['role'] + ' | ' + str(segment['weight']) + ' | ' + span + ' |')
    lines.append('')

    lines += ['## 3. 逐字单元', '', '| # | 字符 | 部位 | 来源分段 | 权重 |', '|---|---|---|---|---|']
    for unit in units:
        lines.append('| ' + str(unit['i']) + ' | ' + unit['char'] + ' | ' + unit['role'] + ' | ' +
                     str(unit['segment']) + ' | ' + str(unit['weight']) + ' |')
    lines.append('')

    lines += ['## 4. 语义 → 蜂体参数（确定性公式）', '', '| 来源 | 派生结果 | 规则 |', '|---|---|---|']
    for entry in result['trace']:
        lines.append('| ' + entry['from'] + ' | ' + entry['to'] + ' | ' + entry['rule'] + ' |')
    lines.append('')

    meanings = {'wingbeatHz': '翅膀振动频率（Hz）', 'tension': '体节绷紧程度 0–1',
                'spacing': '体节间距系数 0.7–1.3', 'hue': '主色相（度）',
                'posture': '姿态：curl 向内收 / open 向外张 / level 平',
                'bodyScale': '整体大小系数 0.85–1.15', 'bodyWidth': '绘制用蜂体宽',
                'bodyHeight': '绘制用蜂体高', 'segmentCount': '结构单元数（= 非空白字符数）'}
    lines += ['## 5. 本次派生出的蜂体规格', '', '| 参数 | 值 | 含义 |', '|---|---|---|']
    for key, value in bee.items():
        lines.append('| ' + key + ' | ' + str(value) + ' | ' + meanings.get(key, '') + ' |')
    lines.append('')
    return chr(10).join(lines)


def payload(transcript, model):
    """构造 DeepSeek（OpenAI 兼容）请求体；提示词与 schema 一并下发。"""
    body = (PROMPT.read_text(encoding='utf-8').split('\n---\n', 1)[1]).strip()
    schema = nesting.read(SCHEMA)
    return {'model': model, 'stream': False, 'response_format': {'type': 'json_object'}, 'messages': [
        {'role': 'system', 'content': body + '\nJSON Schema:\n' + json.dumps(schema, ensure_ascii=False)},
        {'role': 'user', 'content': json.dumps({'transcript': transcript}, ensure_ascii=False)}]}


# 两次尝试共享的总等待预算。原为 8 秒：实测平均 2.8 秒但偶发 4–6 秒，
# 第一次一慢，第二次就只剩两三秒必然失败，现场失败率约三成。放宽到 15 秒后
# 仍有兜底（超时即判失败，绝不用占位数据冒充），代价是观众多等几秒。
MODEL_WAIT_SECONDS = 15


def run_live(transcript, endpoint, model, key, send=nesting.transport):
    """调用真实模型一次；格式失败最多重试一次。密钥只在内存与子进程间传递。"""
    nesting.endpoint_check(endpoint)
    if not str(transcript).strip():
        raise Invalid('缺少转写文本')
    if not model.strip() or not key.strip():
        raise ConnectionFailure('尚未配置模型名称或本机密钥')
    request = payload(transcript, model)
    started = nesting.time.monotonic()
    deadline = started + MODEL_WAIT_SECONDS
    for attempt in range(2):
        remaining = deadline - nesting.time.monotonic()
        if remaining <= 0:
            raise ConnectionFailure('本次总等待超过 ' + str(MODEL_WAIT_SECONDS) + ' 秒')
        raw = send(endpoint, key, request, remaining)
        try:
            envelope = nesting.loads(raw)
            choice = envelope['choices'][0]
            if choice.get('finish_reason') != 'stop' or choice['message'].get('refusal'):
                raise Invalid('模型拒绝或未完成输出')
            decoded = nesting.loads(choice['message']['content'])
            dropped = []
            prune_to_schema(decoded, nesting.read(SCHEMA), dropped)
            validate_decode(decoded, transcript)
            result = {'mode': 'live', 'model_requested': model,
                      'model_returned': envelope.get('model', '未提供'),
                      'elapsed_seconds': round(nesting.time.monotonic() - started, 3),
                      'attempts': attempt + 1, 'decode': decoded}
            if dropped:
                result['pruned_fields'] = sorted(set(dropped))
                result['pruned_notice'] = '模型输出了 schema 之外的字段，已剥离且不参与派生：' + '、'.join(sorted(set(dropped)))
            return result
        except (Invalid, KeyError, IndexError, TypeError):
            if attempt == 1:
                raise Invalid('模型连续两次未返回合规结果；未生成蜂体数据')
            request['messages'].append({'role': 'system', 'content':
                '上次输出未通过格式校验。请重新输出完整、符合 schema 的 JSON，segments 拼接必须与原话逐字相同。'})
    raise Invalid('没有有效结果')


def main():
    parser = argparse.ArgumentParser(description='筑巢语言解码：语义 → 文字结构蜂')
    parser.add_argument('mode', choices=['demo', 'validate', 'live', 'derive'])
    parser.add_argument('--candidate', type=Path, help='validate：待校验的解码结果')
    parser.add_argument('--transcript', default='', help='live：已转写的原话（ASR 未接入时手工提供）')
    parser.add_argument('--input', type=Path, help='derive：已有的解码结果文件（跳过模型）')
    parser.add_argument('--save', type=Path, help='显式保存结果；不自动记录私人输入')
    parser.add_argument('--md', type=Path, help='同时写出逐项对应表（映射表.md）；由同一实现生成，禁止手改')
    parser.add_argument('--source-label', default=DEFAULT_SOURCE_LABEL, help='映射表里标注的示例来源')
    args = parser.parse_args()
    try:
        if args.mode == 'demo':
            decoded = nesting.read(PLACEHOLDER)
            result = {'mode': 'demo', 'notice': '手工占位解码，未调用模型'}
        elif args.mode == 'validate':
            if not args.candidate:
                raise Invalid('请选择待校验的解码结果文件')
            decoded = nesting.read(args.candidate)
            result = {'mode': 'imported', 'notice': '仅通过结构校验，来源与语义未验证'}
        elif args.mode == 'derive':
            if not args.input:
                raise Invalid('请选择已有的解码结果文件')
            decoded = nesting.read(args.input)
            result = {'mode': 'derived', 'notice': '由已有解码结果确定性派生，未调用模型'}
        else:
            result = run_live(args.transcript.rstrip('\n'),
                              nesting.os.environ.get('NESTING_ENDPOINT')
                              or 'https://api.deepseek.com/chat/completions',
                              nesting.os.environ.get('NESTING_MODEL') or 'deepseek-chat',
                              nesting.os.environ.get('NESTING_API_KEY', ''))
            decoded = result['decode']

        derived = derive(decoded)
        result['decode'] = decoded
        result['units'] = derived['units']
        result['bee'] = derived['bee']
        result['trace'] = derived['trace']
        result['created_at'] = datetime.now(timezone.utc).isoformat()
        result['prompt_sha256'] = hashlib.sha256(PROMPT.read_bytes()).hexdigest()
        result['schema_sha256'] = hashlib.sha256(SCHEMA.read_bytes()).hexdigest()
        if args.md:
            args.md.write_text(trace_markdown(result, args.source_label), encoding='utf-8')
            print('已写出映射表：' + str(args.md))
        if args.save:
            with args.save.open('x', encoding='utf-8') as file:
                json.dump(result, file, ensure_ascii=False, indent=2)
            print('已保存：' + str(args.save))
        elif not args.md:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (Invalid, ConnectionFailure) as exc:
        print('未完成：' + str(exc), file=sys.stderr)
    except (OSError, UnicodeError):
        print('未完成：文件无法读取、已存在或无法写入', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
