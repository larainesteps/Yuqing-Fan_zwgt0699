import { Activity, ChevronRight, Stethoscope, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApiResource } from '../hooks/useApiResource';
import { PageHeader } from '../components/PageHeader';
import { fmt } from '../lib/format';

type ResourcePools = {
  doctors?: unknown[];
  nurses?: unknown[];
  theatres?: unknown[];
  beds?: unknown[];
};

type Card = { title: string; count: number; detail: string; tone: string; icon: ReactNode };

export default function ResourcesPage() {
  const resources = useApiResource<ResourcePools>('/resources', 'Resources');
  const pools = resources.data ?? {};

  const cards: Card[] = [
    {
      title: 'Doctors',
      count: pools.doctors?.length ?? 0,
      detail: 'Clinical doctors imported from resource codes',
      tone: 'violet',
      icon: <Users />
    },
    {
      title: 'Nurses',
      count: pools.nurses?.length ?? 0,
      detail: 'Nurse resources split from comma-separated CSV fields',
      tone: 'blue',
      icon: <Activity />
    },
    {
      title: 'Theatres',
      count: pools.theatres?.length ?? 0,
      detail: `${pools.beds?.length ?? 0} beds also imported`,
      tone: 'green',
      icon: <Stethoscope />
    }
  ];

  return (
    <>
      <PageHeader title="Resources" onRefresh={resources.reload} />
      {resources.error && <div className="notice">{resources.error}</div>}
      <section className="resource-grid">
        {cards.map((card) => (
          <article className="panel resource" key={card.title}>
            <span className={`metric-icon ${card.tone}`}>{card.icon}</span>
            <strong>{resources.loading ? '—' : fmt(card.count)}</strong>
            <h2>{card.title}</h2>
            <p>{card.detail}</p>
            <button>
              Normalized resources <ChevronRight size={16} />
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
