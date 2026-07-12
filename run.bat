@echo off
REM fullcourt 3d basketball playtest. English-only, CRLF.
cd /d "%~dp0"
echo Starting 3D Basketball ...
if not exist "node_modules" call npm install
call npm run dev -- --open
pause
