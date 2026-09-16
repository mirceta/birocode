@echo off
cd /d "%~dp0\..\.."
node tests\provider-parity\ui.mjs > .claudeweb-preview\provider-parity-ui.log 2>&1
