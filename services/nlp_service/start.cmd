@echo off
REM Clinical NLP service (port 8101).
REM Falls back to the traceable rule engine when OPENAI_API_KEY is not set.
cd /d "%~dp0..\.."

if not defined OPENAI_API_KEY for /f "usebackq delims=" %%K in (`powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable('OPENAI_API_KEY','User')"`) do set "OPENAI_API_KEY=%%K"
if not defined NLP_PROVIDER set "NLP_PROVIDER=auto"
if not defined NLP_OPENAI_MODEL set "NLP_OPENAI_MODEL=gpt-5.6-luna"
if not defined NLP_ALLOW_RULE_FALLBACK set "NLP_ALLOW_RULE_FALLBACK=true"

python -m services.nlp_service.app --port 8101
