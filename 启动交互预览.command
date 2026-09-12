#!/bin/zsh
cd "$(dirname "$0")" || exit 1
/usr/bin/python3 web/interaction/server.py --port 0 --open
