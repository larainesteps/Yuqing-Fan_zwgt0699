import type { CaseRow } from '../types';
import { time } from '../lib/format';

export function CaseTable({ data }: { data: CaseRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Appointment</th>
            <th>Patient</th>
            <th>Service</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Delay</th>
            <th>Requested</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.appointment_id}>
              <td>
                <b>{row.appointment_id}</b>
              </td>
              <td>{row.source_patient_id}</td>
              <td>{row.service_type}</td>
              <td>
                <span className={`pill ${(row.schedule_status || 'routine').toLowerCase()}`}>
                  {row.schedule_status}
                </span>
              </td>
              <td>{Number(row.duration_hours).toFixed(1)} h</td>
              <td>{row.delay_days ?? '—'}</td>
              <td>{time(row.requested_datetime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
