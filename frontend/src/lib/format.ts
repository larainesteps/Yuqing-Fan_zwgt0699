// Presentation helpers shared across pages. Kept free of React so they can be unit tested
// without a renderer.
import type { ScheduleRow } from '../types';

const ENGLISH_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function fmt(n: number) {
  return new Intl.NumberFormat().format(Number(n || 0));
}

export function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function time(value?: string | null) {
  return value ? ENGLISH_DATE_TIME.format(new Date(value)) : '—';
}

/** Colour family for a service line, used by the timeline and the agenda bars. */
export function toneFor(service: string) {
  if (service === 'surgery') return 'blue';
  if (service === 'emergency') return 'coral';
  if (service === 'ICU') return 'violet';
  return 'mint';
}

/** Position a schedule row within a 24-hour lane, as percentages of the day. */
export function slotStyle(row: ScheduleRow) {
  const start = new Date(row.scheduled_datetime);
  const end = new Date(row.scheduled_end_datetime);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const duration = Math.max(20, (end.getTime() - start.getTime()) / 60000);
  return {
    left: `${Math.min(95, (startMinutes / 1440) * 100)}%`,
    width: `${Math.min(45, Math.max(5, (duration / 1440) * 100))}%`
  };
}

/** Format an ISO timestamp for a `datetime-local` input, which expects local time. */
export function dateTimeInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function jsonField<T>(value: T | string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
