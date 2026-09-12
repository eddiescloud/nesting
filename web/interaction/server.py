#!/usr/bin/env python3
"""Loopback-only static preview plus reuse of the existing input/output validator."""
import argparse
import importlib.util
import json
import mimetypes
import os
from pathlib import Path
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
MODULE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('nesting_validator', ROOT / '07-技术验证/nesting.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)

decode_spec = importlib.util.spec_from_file_location('nesting_decode', ROOT / '10-语言解码/derive_bee.py')
decoder = importlib.util.module_from_spec(decode_spec)
decode_spec.loader.exec_module(decoder)

score_spec = importlib.util.spec_from_file_location('nesting_score', ROOT / '09-声音设计/build_score.py')
scorer = importlib.util.module_from_spec(score_spec)
score_spec.loader.exec_module(scorer)

_SCORES = {}


def score_for(preset_id):
    """按预设推导音画同步时间线（唯一事实来源：09-声音设计/build_score.py）。

    波形要画的是真实的声音结构，所以这里不重复实现公式，直接复用推导器；
    同一预设只算一次。
    """
    if preset_id in _SCORES:
        return _SCORES[preset_id]
    for item in preset_data():
        if item['id'] == preset_id:
            score = scorer.build(item['output'], item['source'])
            _SCORES[preset_id] = score
            return score
    raise validator.Invalid('没有这个预设')

# 模型配置只来自环境变量：不写盘、不进日志、不回显。
MODEL_ENDPOINT = os.environ.get('NESTING_ENDPOINT') or 'https://api.deepseek.com/chat/completions'
MODEL_NAME = os.environ.get('NESTING_MODEL') or 'deepseek-chat'
MODEL_KEY = os.environ.get('NESTING_API_KEY', '')


def model_configured():
    return bool(MODEL_KEY.strip() and MODEL_NAME.strip())


# 语音识别（ASR）接入点。
# 现状：未接入。DeepSeek 不提供 audio 接口，方案未定（本地 whisper / 云 ASR / 浏览器识别）。
# 约定：在接入之前，客户端不得把录音发到任何地方 —— 探测接口据此如实返回 available=False，
# POST 直接 501，服务端既不接收也不保存音频。将来接入时只需在这里实现 forward，
# 并把下面的 available 改为真实能力；同时必须同步界面上的隐私说明。
ASR_NOTICE = '语音识别未接入：请把这句话写进输入框，或直接修改下面的文字。'
ASR_REFUSAL = '语音识别未接入：服务端不接收、不保存录音。'


DEMO_DIR = ROOT / '10-语言解码/examples'


def demo_items():
    """演示素材：人工编写的解码结果 + 现算的蜂体规格与证据。

    每一条都必须自带 manual-placeholder 标注，界面据此显示「未调用模型」；
    演示通路完全不依赖模型密钥。
    """
    items = []
    for path in sorted(DEMO_DIR.glob('decode.demo-*.json')):
        decoded = validator.read(path)
        decoder.validate_decode(decoded)
        derived = decoder.derive(decoded)
        items.append({
            'id': path.stem,
            'label': decoded['tone']['label'],
            'transcript': decoded['transcript'],
            'summary': decoded['meaning']['gist'],
            'source': 'manual-placeholder',
            'notice': '演示素材：人工编写的解码结果，未调用模型',
            'decode': decoded,
            'units': derived['units'],
            'bee': derived['bee'],
            'trace': derived['trace'],
        })
    return items


def transcribe_capability():
    return {'available': False, 'notice': ASR_NOTICE, 'accepts': 'audio/webm'}


def decode_transcript(transcript, allow_undecoded=True):
    """把一句转写解码成蜂体结构。未配置模型时不编造语气，只做结构拆分并标注。"""
    text = transcript.strip()
    if not text:
        raise validator.Invalid('缺少转写文本')
    if not model_configured():
        if not allow_undecoded:
            raise validator.ConnectionFailure('尚未配置模型密钥')
        result = decoder.derive_undecoded(text)
        result.update({'mode': 'undecoded', 'model': None,
                       'notice': '模型未配置（缺少 NESTING_API_KEY）：只按文字结构拆出单元，语气与含义没有解码。'})
        return result
    live = decoder.run_live(text, MODEL_ENDPOINT, MODEL_NAME, MODEL_KEY)
    derived = decoder.derive(live['decode'])
    return {'mode': 'live', 'model': MODEL_NAME, 'model_returned': live.get('model_returned', '未提供'),
            'elapsed_seconds': live.get('elapsed_seconds'), 'attempts': live.get('attempts'),
            'notice': '由 ' + MODEL_NAME + ' 实时解码（语气与含义为模型判断，可被否定）',
            'decode': live['decode'], 'units': derived['units'], 'bee': derived['bee'],
            'trace': derived['trace']}


def preset_data():
    primary = {
        'id': 'unspoken', 'title': '想说，却停住', 'description': '想要开口的瞬间，又把话收了回去。',
        'source': 'manual-preset',
        'input': validator.read(ROOT / '04-AI转译/input.example.json'),
        'output': validator.read(ROOT / '04-AI转译/output.example-手工占位.json'),
    }
    data = [primary] + validator.read(MODULE / 'presets.json')
    for item in data:
        validator.validate_output(item['output'], item['input'])
        if item['source'] != 'manual-preset':
            raise validator.Invalid('预设来源必须明确')
    if len({item['id'] for item in data}) != len(data):
        raise validator.Invalid('预设 ID 重复')
    return data


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Do not log visitor inputs or URL queries.

    def trusted_host(self):
        host = self.headers.get('Host', '')
        return host in ('127.0.0.1:' + str(self.server.server_port), 'localhost:' + str(self.server.server_port))

    def send_bytes(self, status, data, kind):
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_json(self, status, value):
        self.send_bytes(status, json.dumps(value, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')

    def do_GET(self):
        if not self.trusted_host():
            return self.send_json(403, {'error': '仅限本机预览'})
        parts = urlsplit(self.path)
        route = unquote(parts.path)
        if route == '/api/score':
            wanted = parse_qs(parts.query).get('id', [''])[0]
            try:
                return self.send_json(200, {'score': score_for(wanted)})
            except (validator.Invalid, KeyError, TypeError):
                return self.send_json(404, {'error': '没有这个预设'})
        if route == '/api/transcribe':
            return self.send_json(200, transcribe_capability())
        if route == '/api/demo':
            return self.send_json(200, {'items': demo_items()})
        if route == '/api/presets':
            try:
                return self.send_json(200, {'presets': preset_data()})
            except (OSError, ValueError, KeyError, TypeError):
                return self.send_json(500, {'error': '演示数据未通过检查，请检查预设文件'})
        if route == '/':
            route = '/web/interaction/index.html'
        requested = ROOT / route.lstrip('/')
        target = requested.resolve()
        allowed_roots = [(ROOT / 'web' / name).resolve() for name in ('interaction', 'visual', 'audio')]
        extensions = {'.html', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff2', '.mp3', '.wav', '.ogg', '.mp4', '.glb', '.bin', '.wasm'}
        if not any(base in target.parents for base in allowed_roots) or target.suffix.lower() not in extensions:
            return self.send_json(404, {'error': '文件不存在'})
        if any(part.startswith('.') for part in requested.relative_to(ROOT).parts) or not target.is_file():
            return self.send_json(404, {'error': '文件不存在'})
        try:
            data = target.read_bytes()
        except OSError:
            return self.send_json(404, {'error': '文件无法读取'})
        kind = mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
        if target.suffix in ('.js', '.mjs'):
            kind = 'text/javascript'
        if target.suffix in ('.html', '.css', '.js', '.mjs', '.json', '.svg'):
            kind += '; charset=utf-8'
        self.send_bytes(200, data, kind)

    def do_POST(self):
        if not self.trusted_host():
            return self.send_json(403, {'error': '仅限本机预览'})
        origin = self.headers.get('Origin')
        expected = 'http://' + self.headers.get('Host', '')
        if origin and origin != expected:
            return self.send_json(403, {'error': '请求来源无效'})
        route = urlsplit(self.path).path
        if route == '/api/transcribe':
            # 未接入 ASR：不读取请求体、不落盘、不转发。
            return self.send_json(501, {'error': ASR_REFUSAL, 'available': False})
        if route not in ('/api/validate-input', '/api/decode'):
            return self.send_json(404, {'error': '没有此接口'})
        if self.headers.get_content_type() != 'application/json':
            return self.send_json(415, {'error': '需要 JSON 输入'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16384:
                return self.send_json(413, {'error': '输入内容超过限制'})
            self.connection.settimeout(12)
            raw = self.rfile.read(size).decode('utf-8')
            data = validator.loads(raw)
        except (ValueError, UnicodeError):
            return self.send_json(400, {'error': '输入内容无法读取'})
        except OSError:
            return self.send_json(408, {'error': '本地读取超时，请重试'})

        if route == '/api/decode':
            transcript = data.get('transcript') if isinstance(data, dict) else None
            if not isinstance(transcript, str) or not transcript.strip():
                return self.send_json(400, {'error': '请先提供一句转写文本'})
            if len(transcript) > decoder.MAX_TRANSCRIPT:
                return self.send_json(400, {'error': '原话请控制在 ' + str(decoder.MAX_TRANSCRIPT) + ' 字以内'})
            try:
                return self.send_json(200, decode_transcript(transcript))
            except validator.ConnectionFailure as exc:
                return self.send_json(502, {'error': str(exc)})
            except validator.Invalid as exc:
                return self.send_json(422, {'error': str(exc)})

        try:
            validator.validate_input(data)
        except (ValueError, UnicodeError):
            return self.send_json(400, {'error': '请填写两句原话，每句不超过 120 字；情境与感受各不超过 180 字。'})
        # Never echo, persist, or relay personal input to a model.
        return self.send_json(200, {'valid': True, 'generated': False, 'message': '格式已检查。模型尚未接入，未生成画面；内容仅在本次页面中保留。'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    try:
        server = Server(('127.0.0.1', args.port), Handler)
    except OSError:
        print('此端口已占用。可指定 --port 0 使用空闲端口。', flush=True)
        return 1
    url = 'http://127.0.0.1:' + str(server.server_port) + '/'
    print('筑巢交互预览：' + url, flush=True)
    print('模型：' + (MODEL_NAME + '（已配置密钥，仅从环境变量读取）' if model_configured()
                      else '未配置（缺少 NESTING_API_KEY）：解码只做文字结构拆分，不调用外部模型'),
          flush=True)
    print('按 Ctrl+C 结束。', flush=True)
    if args.open:
        threading.Timer(0.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
