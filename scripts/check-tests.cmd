@echo off
REM Full regression: export the contract schemas, then run every Python test under tests/.
cd /d "%~dp0.."

python -m contracts.export_schemas
if errorlevel 1 exit /b %errorlevel%

python -m unittest discover -s tests -p "test_*.py" -v
