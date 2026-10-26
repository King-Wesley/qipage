@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js and try again.
  pause
  exit /b 1
)
node "%~dp0launch.cjs"
if errorlevel 1 pause
