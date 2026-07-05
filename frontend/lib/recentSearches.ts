'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SearchParams } from '../../shared/types';

// Recent searches, persisted to localStorage so returning users can re-run a
// past search in one click from the hero. Deduplicated by destination+dates,
// capped, most-recent first.

const STORAGE_KEY = 'voyager:recent-searches';
const MAX_RECENT = 6;

export interface RecentSearch {
  destination: string;
  checkin: string;
  checkout: string;
  adults?: number;
  children?: number;
  rooms?: number;
}

function sameSearch(a: RecentSearch, b: RecentSearch): boolean {
  return a.destination === b.destination && a.checkin === b.checkin && a.checkout === b.checkout;
}

function readStored(): RecentSearch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  // Loaded after mount to keep SSR/first-render markup deterministic.
  useEffect(() => {
    setRecent(readStored());
  }, []);

  const record = useCallback((params: SearchParams) => {
    if (!params.destination || !params.checkin || !params.checkout) return;
    const entry: RecentSearch = {
      destination: params.destination,
      checkin: params.checkin,
      checkout: params.checkout,
      adults: params.adults,
      children: params.children,
      rooms: params.rooms,
    };
    setRecent((prev) => {
      const next = [entry, ...prev.filter((r) => !sameSearch(r, entry))].slice(0, MAX_RECENT);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* best-effort */
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setRecent([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* best-effort */
    }
  }, []);

  return { recent, record, clear };
}
