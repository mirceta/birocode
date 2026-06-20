@echo off
REM Launch the Chat system-test hub, detached, in its own minimized window so it
REM survives this terminal closing. Double-click it, or run from anywhere.
REM Override the port with:  set HUB_PORT=5321  before running.
cd /d "%~dp0"
start "chat-systest-hub" /min node "%~dp0server.mjs"
echo Chat system-test hub launched. Open http://localhost:%HUB_PORT% (default 5320).
