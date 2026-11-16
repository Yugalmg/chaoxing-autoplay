@echo off
title 学习通代挂控制台
cd /d "%~dp0"

echo.
echo   ============================================
echo      学习通代挂控制台
echo   ============================================
echo.

if not exist "runtime\node.exe" goto NONODE
if not exist "state" mkdir state
if not exist "log" mkdir log
runtime\node.exe server.mjs
goto END

:NONODE
where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未找到 Node 运行时
  echo   本程序应自带 runtime\node.exe
  pause
  exit /b 1
)
if not exist "state" mkdir state
if not exist "log" mkdir log
node server.mjs

:END
pause