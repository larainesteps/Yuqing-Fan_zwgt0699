import { Plus, Search } from 'lucide-react';
import { useSearch } from '../hooks/useSearch';

/**
 * Shared page heading. `onRefresh` is omitted by pages that manage their own reloading, and
 * `searchable` is false on pages the search field does not apply to.
 */
export function PageHeader({
  title,
  searchable = true,
  onRefresh
}: {
  title: string;
  searchable?: boolean;
  onRefresh?: () => void;
}) {
  const { query, setQuery } = useSearch();

  return (
    <header>
      <div>
        <div className="eyebrow">Imported hospital scheduling dataset</div>
        <h1>{title}</h1>
      </div>
      <div className="header-actions">
        {searchable && (
          <>
            <label className="search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search cases"
              />
            </label>
            {onRefresh && (
              <button className="secondary" onClick={onRefresh}>
                <Plus size={17} />
                Refresh
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
