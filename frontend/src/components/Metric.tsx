import type { ReactNode } from 'react';

export function Metric({
  label,
  value,
  detail,
  tone,
  icon
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <article>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <span className={`metric-icon ${tone}`}>{icon}</span>
    </article>
  );
}
