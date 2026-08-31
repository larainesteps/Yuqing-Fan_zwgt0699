@echo off
REM Start the Express API in development mode, reloading through tsx watch.
REM The port comes from PORT in the root .env, defaulting to 4000.
cd /d "%~dp0..\backend"

if not exist node_modules (
  echo Installing backend dependencies...
  call npm install
)

npm run dev
