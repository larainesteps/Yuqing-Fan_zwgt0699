@echo off
REM Start the four Python services (NLP 8101 / Priority 8102 / Optimizer 8103 / Evaluation 8104).
REM Each service opens its own console; closing the window stops that service.
cd /d "%~dp0.."

echo Starting TheatreFlow Python services...
start "TheatreFlow NLP 8101"        cmd /k python -m services.nlp_service.app --port 8101
start "TheatreFlow Priority 8102"   cmd /k python -m services.priority_service.app --port 8102
start "TheatreFlow Optimizer 8103"  cmd /k python -m services.optimizer_service.app --port 8103
start "TheatreFlow Evaluation 8104" cmd /k python -m services.evaluation_service.app --port 8104

echo.
echo   NLP        http://127.0.0.1:8101/health
echo   Priority   http://127.0.0.1:8102/health
echo   Optimizer  http://127.0.0.1:8103/health
echo   Evaluation http://127.0.0.1:8104/health
