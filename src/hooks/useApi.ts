import { useState, useEffect, useCallback } from 'react';

export const API = 'http://localhost:3000/api';

export function useFetch<T>(url: string, interval?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${API}${url}`);
      const d = await r.json();
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e?.message);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
    if (!interval) return;
    const t = setInterval(fetchData, interval);
    return () => clearInterval(t);
  }, [fetchData, interval]);

  return { data, error, refresh: fetchData };
}

export async function post<T = any>(url: string, body?: any): Promise<T> {
  const r = await fetch(`${API}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export async function patch<T = any>(url: string, body?: any): Promise<T> {
  const r = await fetch(`${API}${url}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export async function del<T = any>(url: string): Promise<T> {
  const r = await fetch(`${API}${url}`, { method: 'DELETE' });
  return r.json();
}
