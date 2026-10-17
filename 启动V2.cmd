@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Local hold: Bilibili reported access restrictions. Do not resume live requests.
set COLLECTOR_BLOCKED_PLATFORMS=bilibili
powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest 'http://127.0.0.1:8765/' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200 -and $r.Content.Contains('local-token')) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 (
  echo V2 已在运行，正在打开工作台...
  start "" "http://127.0.0.1:8765/"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更新版本，再重新运行。
  pause
  exit /b 1
)
if not exist node_modules\playwright (
  echo 首次启动，正在安装依赖，请保持联网...
  call npm install
  if errorlevel 1 (
    echo 安装失败。请检查网络与终端错误后重试。
    pause
    exit /b 1
  )
)
echo 请等待“V2已启动”提示，再打开 http://127.0.0.1:8765
set COLLECTOR_OPEN=1
call npm start
pause
