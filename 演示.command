#!/bin/zsh
# 筑巢 / Nesting · 一键演示（离线，不需要密钥、不需要麦克风）
#
# 做什么：起本机预览服务，并用 ?demo=1 打开浏览器直达演示入口。
# 演示素材全部是人工占位，画面上会明确标注「未调用模型」。
cd "$(dirname "$0")" || exit 1

PORT=0
if [ "$#" -ge 1 ]; then PORT="$1"; fi

echo "正在启动演示…"
echo "演示入口会用 ?demo=1 打开；素材为人工占位，未调用模型。"
/usr/bin/python3 - "$PORT" <<'PYEOF'
import subprocess, sys, threading, webbrowser
port = sys.argv[1]
url = None

def open_browser():
    if url:
        webbrowser.open(url)

server = subprocess.Popen([sys.executable, 'web/interaction/server.py', '--port', port],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
threading.Timer(1.2, open_browser).start()
try:
    for line in server.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        if 'http://127.0.0.1:' in line and url is None:
            url = line.split('http://127.0.0.1:')[1].strip().rstrip('/')
            url = 'http://127.0.0.1:' + url + '/?demo=1'
    server.wait()
except KeyboardInterrupt:
    server.terminate()
PYEOF
