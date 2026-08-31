@echo off
REM NLP checks only, forced onto the rule engine so no OpenAI call is made.
cd /d "%~dp0.."
set "NLP_PROVIDER=rules"

python -m contracts.export_schemas
if errorlevel 1 exit /b %errorlevel%

python -m unittest tests.test_nlp_service -v
if errorlevel 1 exit /b %errorlevel%

python -m services.nlp_service.evaluation samples\v1\nlp-evaluation.jsonl --provider rules
