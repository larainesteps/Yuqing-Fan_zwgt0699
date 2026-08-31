import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type SearchState = { query: string; setQuery: (value: string) => void };

const SearchContext = createContext<SearchState>({ query: '', setQuery: () => {} });

/**
 * The search field lives in the shared header but filters whatever page is open, so the term
 * is held here rather than in any one page.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  return useContext(SearchContext);
}

/** Case-insensitive match over the fields a scheduler would search by. */
export function matchesQuery(query: string, ...fields: Array<string | null | undefined>) {
  if (!query.trim()) return true;
  return fields.filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase());
}
