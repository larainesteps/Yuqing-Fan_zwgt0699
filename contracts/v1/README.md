# TheatreFlow Contract v1

These JSON Schema files are the public boundary between the API gateway and the independent NLP, priority, optimizer, and evaluation modules.

Rules:

- Consumers must reject unknown fields.
- Date-time values use ISO 8601 with an explicit timezone.
- Every root payload contains `contract_version: "v1"`.
- Breaking changes require a new version directory.
- Services may add internal fields to their databases, but public responses must validate against these schemas.

Regenerate schemas from the project root:

```powershell
python -m contracts.export_schemas
```
