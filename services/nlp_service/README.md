# NLP Service

Extracts scheduling-relevant facts and surgical urgency from English clinical notes.
It is independently runnable before an API key is available.

## Runtime modes

`NLP_PROVIDER=auto` is the default:

- without `OPENAI_API_KEY`: conservative rule/dictionary baseline;
- with `OPENAI_API_KEY`: strict JSON Schema extraction through the Responses API;
- if the API is temporarily unavailable: rules are used and a warning is returned.

The no-key result is deliberately marked for human review when urgency is inferred,
the procedure is unknown, or confidence is below 0.70.

```powershell
python -m services.nlp_service.app --port 8101
python -m services.nlp_service.app --check
```

Endpoints: `GET /health`, `GET /metadata`, `POST /extract`.

## Configuration

Because API keys must not be committed to `.env` or source files, use the interactive
Windows setup script from the project root. It hides the value while it is entered and
stores it as a user environment variable:

```powershell
.\configure-openai-key.ps1
```

If PowerShell blocks local scripts, run this process-scoped command first:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\configure-openai-key.ps1
```

The service start script reads the saved user variable without printing the key.
The equivalent temporary variables for development are:

```powershell
$env:NLP_PROVIDER = "auto"        # auto | rules | openai
$env:OPENAI_API_KEY = "..."       # add later; never commit it
$env:NLP_OPENAI_MODEL = "gpt-5.6-luna"
$env:NLP_ALLOW_RULE_FALLBACK = "true"
```

To require the configured LLM and fail instead of falling back:

```powershell
$env:NLP_PROVIDER = "openai"
$env:NLP_ALLOW_RULE_FALLBACK = "false"
```

## Prepare a PMC-Patients subset

Download `PMC-Patients.csv`, then stream-filter a small English surgical subset:

```powershell
python -m services.nlp_service.pmc_patients `
  C:\data\PMC-Patients.csv `
  data\pmc-surgical-1000.jsonl `
  --limit 1000
```

The script only reads and filters the source dataset. It does not treat the corpus as a
scheduling-label dataset, because PMC-Patients does not provide ground-truth urgency or
operating-resource labels.

## Prepare manual labels

Create an Excel-compatible UTF-8 CSV for 200 manually reviewed cases:

```powershell
python -m services.nlp_service.annotations `
  data\pmc-surgical-1000.jsonl `
  data\pmc-surgical-annotations.csv `
  --limit 200
```

## Batch extraction

Rules mode is deterministic and does not use API credits:

```powershell
python -m services.nlp_service.batch `
  data\pmc-surgical-1000.jsonl `
  data\pmc-surgical-extractions.jsonl `
  --provider rules
```

After API billing is available, change `--provider` to `auto` or `openai`.

## Evaluation

The evaluation format stores one `input` contract and one `expected` object per JSONL line.
It reports procedure, speciality and urgency accuracy; duration/time-window MAE; review rate;
and the urgency confusion matrix.

```powershell
python -m services.nlp_service.evaluation `
  samples\v1\nlp-evaluation.jsonl `
  --provider rules `
  --output data\nlp-rules-report.json
```

Run all NLP checks without API credits:

```powershell
.\check-nlp.cmd
```
