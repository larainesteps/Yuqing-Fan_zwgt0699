@echo off
REM Start the React development server (Vite, port 5173, hot module replacement).
cd /d "%~dp0..\frontend"

if not exist node_modules (
  echo Installing frontend dependencies...
  call npm install
)

npm run dev
