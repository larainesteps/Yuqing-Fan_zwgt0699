# Real Data Import Workflow

This folder contains the normalized MySQL import workflow for the CSV files in:

```text
C:\Users\Dell\Desktop\project\data\scheduled_appointments.csv
C:\Users\Dell\Desktop\project\data\doctor_workload_summary.csv
```

## What the import does

`import-real-data.mjs` reads `scheduled_appointments.csv` and creates normalized records:

- `services`
- `doctors`
- `nurses`
- `theatres`
- `real_beds`
- `patients`
- `schedule_results`
- `resource_bookings`
- `import_audit`

It also fixes cross-midnight windows. If `surgery_end <= surgery_start`, the script treats the end time as next day.

## Run the import

From the project root:

```powershell
cd C:\Users\Dell\Documents\Codex\2026-07-21\files-mentioned-by-the-user-fan26\outputs\surgical-scheduler-demo
$env:PATH="C:\Users\Dell\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:PATH"
npm run db:import-real
npm run db:optimize-real
```

`db:optimize-real` updates MySQL statistics, creates the composite booking index, and materializes exact conflict counts for the Evaluation API. Run it after importing or replacing a scheduling run.

For a custom CSV path:

```powershell
node database\import-real-data.mjs "C:\Users\Dell\Desktop\project\data\scheduled_appointments.csv" csv_import_v1
```

## Check conflicts

```powershell
npm run db:detect-conflicts
```

The conflict detector checks whether the same doctor, nurse, theatre, or bed is booked in overlapping time windows.

## Useful SQL checks

```powershell
F:\mysql\mysql-8.0.28-winx64\bin\mysql.exe --host=127.0.0.1 --port=3306 --user=root --password=123456 theatre_flow
```

Then:

```sql
SELECT COUNT(*) FROM patients;
SELECT COUNT(*) FROM resource_bookings;
SELECT * FROM import_audit ORDER BY imported_at DESC LIMIT 3;
```
