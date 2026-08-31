@echo off
REM Evaluation metrics service (port 8104).
cd /d "%~dp0..\.."
python -m services.evaluation_service.app --port 8104
