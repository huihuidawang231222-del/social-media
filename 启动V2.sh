#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo '请先安装 Node.js 22 或更新版本。'
  exit 1
fi
if [ ! -d node_modules/playwright ]; then npm install; fi
export COLLECTOR_OPEN=1
exec npm start
