import { NavLink } from 'react-router-dom';
import { Activity, Settings2 } from 'lucide-react';
import { ROUTES } from '../routes';
import { fmt } from '../lib/format';

/** Navigation shell. `caseCount` is the badge on the Cases entry, or null while unknown. */
export function Sidebar({ caseCount }: { caseCount: number | null }) {
  return (
    <aside>
      <div className="brand">
        <span className="brandmark">
          <Activity size={19} />
        </span>
        <div>
          <b>TheatreFlow</b>
          <small>Real data scheduler</small>
        </div>
      </div>

      <nav>
        {ROUTES.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <Icon size={18} />
            <span>{label}</span>
            {label === 'Cases' && caseCount !== null && <em>{fmt(caseCount)}</em>}
          </NavLink>
        ))}
      </nav>

      <div className="aside-foot">
        <button>
          <Settings2 size={18} />
          Settings
        </button>
        <div className="user">
          <span>YF</span>
          <div>
            <b>Yuqing Fan</b>
            <small>Scheduler admin</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
