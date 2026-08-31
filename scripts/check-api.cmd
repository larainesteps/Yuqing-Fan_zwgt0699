@echo off
REM API integration tests. The backend must already be running (scripts\start-backend.cmd).
REM
REM   check-api.cmd          read-only tests
REM   check-api.cmd --write  also run the tests that write (one lock and one or two intake cases)
cd /d "%~dp0..\backend"

if /i "%~1"=="--write" (
  set "API_TEST_ALLOW_WRITES=1"
  echo Running API tests INCLUDING writes — rows will be inserted into the database.
) else (
  echo Running read-only API tests. Pass --write to include the tests that insert rows.
)

node --test "tests/*.test.mjs"
