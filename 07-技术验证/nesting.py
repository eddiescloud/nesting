#!/usr/bin/env python3
"""Nesting prototype: explicit live adapter, strict validation, no implicit fallback."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
AI = ROOT / '04-AI转译'

class Invalid(ValueError):
    pass

class ConnectionFailure(RuntimeError):
    pass

def loads(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise Invalid('JSON 含重复字段')
            result[key] = value
        return result
    def constant(value):
        raise Invalid('JSON 含非有限数字')
    try:
        return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)
    except (ValueError, TypeError) as exc:
        raise Invalid('需要有效且无重复字段的 JSON') from exc

def read(path):
    return loads(Path(path).read_text(encoding='utf-8'))

def keys(value, expected):
    if type(value) is not dict or set(value) != set(expected):
        raise Invalid('对象存在缺失或多余字段')

def string(value, limit, empty=False):
    if type(value) is not str or len(value) > limit or (not empty and not value.strip()):
        raise Invalid('文本为空、类型错误或超过长度限制')

def validate_input(data):
    keys(data, ['events'])
    if type(data['events']) is not list or len(data['events']) != 2:
        raise Invalid('需要两段话语')
    for event in data['events']:
        keys(event, ['id', 'utterance', 'context', 'feeling'])
        for key, limit in [('id', 64), ('utterance', 120), ('context', 180), ('feeling', 180)]:
            string(event[key], limit, empty=key in ['context', 'feeling'])
    if data['events'][0]['id'] == data['events'][1]['id']:
        raise Invalid('事件 ID 必须不同')

def validate_schema(value, schema):
    # Implements exactly the schema keywords used by this project; unknown rules fail closed.
    allowed = {'$schema','type','const','properties','required','additionalProperties',
               'items','minItems','maxItems','minimum','maximum'}
    if set(schema) - allowed:
        raise Invalid('结构规则已更新，请同步校验器')
    if 'const' in schema and (type(value) is not type(schema['const']) or value != schema['const']):
        raise Invalid('版本不匹配')
    kind = schema.get('type')
    if kind == 'object':
        keys(value, schema['required'])
        for name, sub in schema['properties'].items():
            validate_schema(value[name], sub)
    elif kind == 'array':
        if type(value) is not list or not schema['minItems'] <= len(value) <= schema['maxItems']:
            raise Invalid('数组长度错误')
        for item in value:
            validate_schema(item, schema['items'])
    elif kind == 'number':
        if type(value) not in (int, float) or not math.isfinite(value) or not schema['minimum'] <= value <= schema['maximum']:
            raise Invalid('参数必须是 0–1 的有限数字')
    elif kind == 'string':
        string(value, 600)
    elif kind is not None:
        raise Invalid('不支持的结构类型')

def validate_output(output, source):
    validate_input(source)
    validate_schema(output, read(AI / 'output.schema.json'))
    if [e['id'] for e in output['events']] != [e['id'] for e in source['events']]:
        raise Invalid('事件 ID 或顺序与输入不一致')
    return output

def payload(source, model):
    validate_input(source)
    prompt = (AI / '系统提示词.md').read_text(encoding='utf-8').split('\n---\n', 1)[1]
    schema = read(AI / 'output.schema.json')
    return {'model': model, 'stream': False, 'messages': [
        {'role': 'system', 'content': prompt + '\nJSON Schema:\n' + json.dumps(schema, ensure_ascii=False)},
        {'role': 'user', 'content': json.dumps(source, ensure_ascii=False)}]}

def endpoint_check(endpoint):
    p = urlsplit(endpoint)
    local = p.hostname in ('127.0.0.1', 'localhost', '::1')
    if not p.hostname or p.username or p.password or p.query or p.fragment:
        raise ConnectionFailure('接口地址格式无效；请使用不含凭证的完整地址')
    if p.scheme != 'https' and not (p.scheme == 'http' and local):
        raise ConnectionFailure('远程接口需要 HTTPS')

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def transport_worker():
    # Runs in a child process so the parent enforces a total wall-clock timeout.
    try:
        task = loads(sys.stdin.read())
        endpoint_check(task['endpoint'])
        request = Request(task['endpoint'], data=json.dumps(task['payload']).encode('utf-8'),
                          headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + task['key']})
        with build_opener(NoRedirect()).open(request, timeout=8) as response:
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ConnectionFailure('响应超过限制')
        sys.stdout.write(raw.decode('utf-8'))
    except HTTPError as exc:
        sys.stdout.write(json.dumps({'transport_error': '接口返回 HTTP ' + str(exc.code)}))
        return 2
    except Exception:
        sys.stdout.write(json.dumps({'transport_error': '网络连接失败或响应无法读取'}))
        return 2
    return 0

def transport(endpoint, key, request, timeout):
    task = {'endpoint': endpoint, 'key': key, 'payload': request}
    try:
        result = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--transport'],
            input=json.dumps(task), text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise ConnectionFailure('模型等待超时；本次停止，可手动重试') from exc
    if result.returncode:
        # Never echo service bodies, headers, key or arbitrary process errors.
        raise ConnectionFailure('模型接口未成功返回，请核对地址、模型及本机凭证')
    return result.stdout

def run_live(source, endpoint, model, key, send=transport):
    endpoint_check(endpoint)
    if not model.strip() or not key.strip():
        raise ConnectionFailure('尚未配置模型名称或本机密钥')
    request = payload(source, model)
    started = time.monotonic()
    deadline = started + 8
    for attempt in range(2):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ConnectionFailure('本次总等待超过 8 秒')
        raw = send(endpoint, key, request, remaining)
        try:
            envelope = loads(raw)
            choice = envelope['choices'][0]
            if choice.get('finish_reason') != 'stop' or choice['message'].get('refusal'):
                raise Invalid('模型拒绝或未完成输出')
            output = loads(choice['message']['content'])
            validate_output(output, source)
            return {'mode': 'live', 'model_requested': model,
                    'model_returned': envelope.get('model', '未提供'),
                    'elapsed_seconds': round(time.monotonic()-started, 3),
                    'attempts': attempt+1, 'output': output,
                    'raw_model_content': choice['message']['content']}
        except (Invalid, KeyError, IndexError, TypeError):
            if attempt == 1:
                raise Invalid('模型连续两次未返回合规结果；未生成动画数据')
            request['messages'].append({'role': 'system', 'content': '上次输出未通过格式校验。请重新输出完整、符合 schema 的 JSON，并保持输入 ID 和顺序。'})
    raise Invalid('没有有效结果')

def main():
    parser = argparse.ArgumentParser(description='筑巢 AI 转译验证')
    parser.add_argument('mode', choices=['demo', 'validate', 'live'])
    parser.add_argument('--input', type=Path, default=AI/'input.example.json')
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--save', type=Path, help='显式保存结果；不自动记录私人输入')
    args = parser.parse_args()
    try:
        source = read(args.input)
        validate_input(source)
        if args.mode == 'demo':
            if source != read(AI/'input.example.json'):
                raise Invalid('占位模式仅适用随附示例，不根据自定义输入生成结果')
            result = {'mode': 'demo', 'notice': '手工占位，未调用模型',
                      'output': validate_output(read(AI/'output.example-手工占位.json'), source)}
        elif args.mode == 'validate':
            if not args.candidate:
                raise Invalid('请选择待校验的输出文件')
            result = {'mode': 'imported', 'notice': '仅通过结构校验，来源与语义未验证',
                      'output': validate_output(read(args.candidate), source)}
        else:
            result = run_live(source, os.environ.get('NESTING_ENDPOINT', ''),
                              os.environ.get('NESTING_MODEL', ''), os.environ.get('NESTING_API_KEY', ''))
        result['created_at'] = datetime.now(timezone.utc).isoformat()
        result['prompt_sha256'] = hashlib.sha256((AI/'系统提示词.md').read_bytes()).hexdigest()
        result['schema_sha256'] = hashlib.sha256((AI/'output.schema.json').read_bytes()).hexdigest()
        if args.save:
            # Exclusive creation prevents silently overwriting a previous run.
            with args.save.open('x', encoding='utf-8') as file:
                json.dump(result, file, ensure_ascii=False, indent=2)
            print('已保存：' + str(args.save))
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (Invalid, ConnectionFailure) as exc:
        print('未完成：' + str(exc), file=sys.stderr)
    except (OSError, UnicodeError):
        print('未完成：文件无法读取、已存在或无法写入', file=sys.stderr)
    return 1

if __name__ == '__main__':
    sys.exit(transport_worker() if sys.argv[1:] == ['--transport'] else main())
