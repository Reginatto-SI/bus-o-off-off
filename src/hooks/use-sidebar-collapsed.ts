import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sidebar_collapsed';
const EVENT_NAME = 'sidebar-collapsed-change';

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setCollapsed(detail);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  return { collapsed, toggleCollapsed };
}
