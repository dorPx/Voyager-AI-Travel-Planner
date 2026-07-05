'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { HotelResult } from '../../shared/types';

// Persisted hotel wishlist. Saved hotels survive reloads and new searches via
// localStorage, keyed by hotel id. Stores the full HotelResult so a future
// "saved hotels" view can render cards without a re-search.

const STORAGE_KEY = 'voyager:favorites';

interface FavoritesContextValue {
  /** Saved hotels, most-recently-added first. */
  favorites: HotelResult[];
  favoriteIds: Set<string>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (hotel: HotelResult) => void;
  count: number;
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

function readStored(): HotelResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  // Start empty on both server and first client render so markup matches
  // (avoids hydration mismatch); the stored list is loaded in an effect.
  const [favorites, setFavorites] = useState<HotelResult[]>([]);

  useEffect(() => {
    setFavorites(readStored());
  }, []);

  const toggleFavorite = useCallback(
    (hotel: HotelResult) => {
      setFavorites((prev) => {
        const exists = prev.some((h) => h.id === hotel.id);
        const next = exists ? prev.filter((h) => h.id !== hotel.id) : [hotel, ...prev];
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* best-effort */
        }
        return next;
      });
    },
    []
  );

  const favoriteIds = new Set(favorites.map((h) => h.id));

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        favoriteIds,
        isFavorite: (id) => favoriteIds.has(id),
        toggleFavorite,
        count: favorites.length,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider');
  return ctx;
}
