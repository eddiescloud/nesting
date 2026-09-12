#!/bin/zsh
cd "$(dirname "$0")/07-技术验证" || exit 1
printf '筑巢：离线检查手工占位数据，不调用模型。\n\n'
/usr/bin/python3 nesting.py demo
printf '\n按回车关闭。'
read -r nesting_done
