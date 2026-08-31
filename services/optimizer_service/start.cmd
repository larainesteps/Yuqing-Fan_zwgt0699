@echo off
REM CP-SAT scheduling optimiser (port 8103). Requires ortools.
cd /d "%~dp0..\.."
set "OPTIMIZER_ENGINE=auto"

python -c "import ortools, pydantic" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] This Python has no ortools or pydantic. Install them first:
  echo         python -m pip install -r services\optimizer_service\requirements.txt
  exit /b 1
)

python -m services.optimizer_service.app --port 8103
