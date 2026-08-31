@echo off
REM Start the whole stack: four Python services -> Express API -> Vite front end.
REM Requires MySQL to be running and .env to be configured at the repository root.
cd /d "%~dp0"

echo [1/3] Python services...
call start-services.cmd

echo [2/3] Backend API...
start "TheatreFlow Backend 4000" cmd /k "%~dp0start-backend.cmd"

echo [3/3] Frontend...
start "TheatreFlow Frontend 5173" cmd /k "%~dp0start-frontend.cmd"

echo.
echo   Frontend  http://localhost:5173
echo   Backend   http://localhost:4000/api/health
