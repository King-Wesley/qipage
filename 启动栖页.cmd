@echo off
setlocal DisableDelayedExpansion
call "%~dp0qipage.cmd" launch
if errorlevel 1 pause