@echo off
cd /d "%~dp0..\.."
node tests\provider-parity\verify.mjs > .claudeweb-preview\provider-parity-live.log 2>&1
exit /b %errorlevel%
