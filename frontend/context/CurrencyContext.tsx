'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

// Display currency for every price in the app. Provider prices stay
// authoritative in USD — non-USD amounts are converted for display only and
// always rendered with a "≈" prefix (honest data: we never present an ECB
// approximation as the bookable price). Selection persists in localStorage.

const STORAGE_KEY = 'voyager:currency';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'ILS', 'AUD', 'CAD'] as const;
export type Currency = (typeof CURRENCIES)[number];

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  /** Formats a USD amount in the selected display currency ("$123" or "≈ €114"). */
  format: (usd: number, opts?: { decimals?: number }) => string;
  /** True while a non-USD currency is selected but rates haven't loaded yet. */
  ratesReady: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

function readStored(): Currency {
  if (typeof window === 'undefined') return 'USD';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return CURRENCIES.includes(raw as Currency) ? (raw as Currency) : 'USD';
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Start as USD on server and first client render (hydration-safe), then
  // load the stored preference in an effect — same pattern as favorites.
  const [currency, setCurrencyState] = useState<Currency>('USD');
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });

  useEffect(() => {
    setCurrencyState(readStored());
  }, []);

  // Rates are only needed once a non-USD currency is active.
  useEffect(() => {
    if (currency === 'USD' || rates[currency]) return;
    let cancelled = false;
    api.getCurrencyRates().then((data) => {
      if (!cancelled) setRates((prev) => ({ ...prev, ...data.rates }));
    });
    return () => {
      cancelled = true;
    };
  }, [currency, rates]);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try {
      window.localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* best-effort */
    }
  }, []);

  const rate = currency === 'USD' ? 1 : rates[currency];
  const ratesReady = currency === 'USD' || typeof rate === 'number';

  const format = useCallback(
    (usd: number, opts?: { decimals?: number }) => {
      const decimals = opts?.decimals ?? 0;
      // Missing rate (fetch pending or failed) — fall back to honest USD.
      const effective: Currency = typeof rate === 'number' ? currency : 'USD';
      const amount = usd * (typeof rate === 'number' ? rate : 1);
      const formatted = new Intl.NumberFormat('en', {
        style: 'currency',
        currency: effective,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(amount);
      return effective === 'USD' ? formatted : `≈ ${formatted}`;
    },
    [currency, rate]
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, format, ratesReady }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider');
  return ctx;
}
