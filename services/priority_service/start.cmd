@echo off
REM Priority scoring service (port 8102).
cd /d "%~dp0..\.."
python -m services.priority_service.app --port 8102
