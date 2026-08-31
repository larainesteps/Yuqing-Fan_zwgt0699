import { useEffect, useState } from 'react';
import { LockKeyhole, Unlock } from 'lucide-react';
import type { ScheduleLock, ScheduleRow } from '../types';
import { fetchJson, postJson } from '../api/client';
import { useApiResource } from '../hooks/useApiResource';
import { matchesQuery, useSearch } from '../hooks/useSearch';
import { PageHeader } from '../components/PageHeader';
import { time, toneFor } from '../lib/format';

export default function SchedulePage() {
  const schedule = useApiResource<ScheduleRow[]>('/schedules/latest', 'Schedule');
  const { query } = useSearch();

  const [locks, setLocks] = useState<ScheduleLock[]>([]);
  const [busyCase, setBusyCase] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchJson<ScheduleLock[]>('/schedules/locks')
      .then(setLocks)
      .catch(() => setMessage('Unable to load case locks.'));
  }, []);

  const toggleLock = async (caseId: string) => {
    const locked = locks.some((lock) => lock.caseId === caseId);
    setBusyCase(caseId);
    setMessage('');
    try {
      const next = locked
        ? await postJson<ScheduleLock[]>(`/schedules/locks/${encodeURIComponent(caseId)}`, undefined, 'DELETE')
        : await postJson<ScheduleLock[]>('/schedules/locks', {
            caseId,
            actor: 'Scheduler admin',
            reason: 'Protected from movement by the scheduler'
          });
      setLocks(next);
      setMessage(
        locked
          ? `${caseId} can now move during rescheduling.`
          : `${caseId} is locked and cannot move.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to change case lock');
    } finally {
      setBusyCase('');
    }
  };

  const rows = (schedule.data ?? [])
    .filter((row) => matchesQuery(query, row.appointment_id, row.service_type, row.theatres))
    .slice(0, 120);

  return (
    <>
      <PageHeader title="Schedule" onRefresh={schedule.reload} />
      {schedule.error && <div className="notice">{schedule.error}</div>}

      <section className="panel full">
        <div className="panel-head">
          <div>
            <h2>Resource schedule</h2>
            <p>
              {schedule.loading
                ? 'Loading real database records...'
                : `${rows.length} scheduled allocations · lock protected cases before emergency insertion`}
            </p>
          </div>
          <span className="safe">
            <LockKeyhole size={14} />
            {locks.length} locked
          </span>
        </div>

        {message && <div className="schedule-lock-message">{message}</div>}

        <div className="agenda">
          {rows.map((item) => {
            const locked = locks.some((lock) => lock.caseId === item.appointment_id);
            return (
              <article key={item.appointment_id}>
                <time>
                  {time(item.scheduled_datetime)}
                  <small>{time(item.scheduled_end_datetime)}</small>
                </time>
                <span className={`bar ${toneFor(item.service_type)}`} />
                <div>
                  <b>
                    {item.appointment_id} · {item.service_type}
                  </b>
                  <small>
                    Doctor {item.doctors || '—'} · Nurse {item.nurses || '—'}
                  </small>
                </div>
                <div>
                  <b>{item.theatres || item.beds || 'No theatre'}</b>
                  <small>Delay {item.delay_days ?? 0} days</small>
                </div>
                <button
                  className={`lock-toggle ${locked ? 'locked' : ''}`}
                  type="button"
                  disabled={busyCase === item.appointment_id}
                  onClick={() => toggleLock(item.appointment_id)}
                >
                  {locked ? <Unlock size={13} /> : <LockKeyhole size={13} />}{' '}
                  {locked ? 'Unlock' : 'Lock'}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
