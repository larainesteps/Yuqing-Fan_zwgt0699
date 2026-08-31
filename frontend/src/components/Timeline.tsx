import type { ScheduleRow } from '../types';
import { slotStyle, toneFor } from '../lib/format';

const HOUR_MARKS = ['00:00', '06:00', '12:00', '18:00', '24:00'];

/** A day view of scheduled work, one lane per resource, at most eight lanes. */
export function Timeline({ rows }: { rows: ScheduleRow[] }) {
  const laneOf = (row: ScheduleRow) => row.theatres || row.beds || row.service_type;
  const lanes = [...new Set(rows.map(laneOf))].slice(0, 8);

  if (!rows.length) {
    return (
      <p style={{ padding: 20, color: '#7d898e' }}>
        No schedule rows found. Run the import script first.
      </p>
    );
  }

  return (
    <div className="timeline">
      <div className="timehead">
        <span />
        {HOUR_MARKS.map((mark) => (
          <b key={mark}>{mark}</b>
        ))}
      </div>
      {lanes.map((lane) => (
        <div className="lane" key={lane}>
          <strong>
            {lane}
            <small>resource lane</small>
          </strong>
          <div className="track">
            {rows
              .filter((row) => laneOf(row) === lane)
              .slice(0, 10)
              .map((row) => (
                <div
                  key={row.appointment_id}
                  className={`slot ${toneFor(row.service_type)}`}
                  style={slotStyle(row)}
                >
                  <b>{row.appointment_id}</b>
                  <span>{row.service_type}</span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
