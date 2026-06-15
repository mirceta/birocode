@echo off
set "PATH=C:\Program Files\nodejs;%SystemRoot%\System32;%SystemRoot%"
cd /d "C:\Users\km\Desktop\playground\birocode\client"
if exist node_modules rd /s /q node_modules
call npm install
echo EXITCODE=%ERRORLEVEL%
