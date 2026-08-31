import { useMemo } from 'react';
import type { CaseRow } from '../types';
import { useApiResource } from '../hooks/useApiResource';
import { matchesQuery, useSearch } from '../hooks/useSearch';
import { PageHeader } from '../components/PageHeader';
import { CaseTable } from '../components/CaseTable';

export default function CasesPage() {
  const cases = useApiResource<CaseRow[]>('/cases', 'Cases');
  const { query } = useSearch();

  const filtered = useMemo(
    () =>
      (cases.data ?? [])
        .filter((row) =>
          matchesQuery(query, row.appointment_id, row.service_type, row.source_patient_id)
        )
        .slice(0, 80),
    [cases.data, query]
  );

  return (
    <>
      <PageHeader title="Cases" onRefresh={cases.reload} />
      {cases.error && <div className="notice">{cases.error}</div>}
      <section className="panel full">
        <div className="panel-head">
          <div>
            <h2>Patient appointment records</h2>
            <p>
              {cases.loading
                ? 'Loading real database records...'
                : `Showing ${filtered.length} of ${cases.data?.length ?? 0} imported records from MySQL`}
            </p>
          </div>
        </div>
        <CaseTable data={filtered} />
      </section>
    </>
  );
}
