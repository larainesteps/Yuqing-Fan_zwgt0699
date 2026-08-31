import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../api/client';

export type ApiResource<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
};

/**
 * Load one API path and expose its state. Each page owns the resources it needs, so a page
 * that fails to load does not blank the rest of the application — the previous behaviour,
 * where a single fetch chain in the root component gated every view.
 */
export function useApiResource<T>(path: string, label = path): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchJson<T>(path)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? `${label}: ${cause.message}` : `Unable to load ${label}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, label, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload };
}
