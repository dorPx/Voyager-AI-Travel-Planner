import { Router, Request, Response } from 'express';
import axios from 'axios';
import { cache } from '../db';
import type { CurrencyRates } from '../../../shared/types';

const router = Router();

// USD-based exchange rates via frankfurter.app (ECB data, keyless). Rates are
// display-only approximations — provider prices stay authoritative in USD, so
// a stale or missing rate can never corrupt a real price. Fail-soft: on any
// upstream error the response is USD-only and the frontend keeps showing $.

const SYMBOLS = ['EUR', 'GBP', 'JPY', 'ILS', 'AUD', 'CAD'];
const RATES_CACHE_KEY = 'currency:usd-rates';
const RATES_CACHE_TTL_SECONDS = 12 * 60 * 60; // ECB publishes daily

router.get('/rates', async (_req: Request, res: Response) => {
  const cached = cache.get<CurrencyRates>(RATES_CACHE_KEY);
  if (cached) return res.json(cached);

  let rates: Record<string, number> = { USD: 1 };
  try {
    const response = await axios.get<{ rates?: Record<string, number> }>(
      'https://api.frankfurter.app/latest',
      { params: { from: 'USD', to: SYMBOLS.join(',') }, timeout: 8_000 }
    );
    rates = { USD: 1, ...(response.data.rates ?? {}) };
  } catch (err: unknown) {
    console.error('[currency] rates fetch failed:', err instanceof Error ? err.message : err);
  }

  const payload: CurrencyRates = { base: 'USD', rates, fetched_at: Date.now() };
  // Only cache a real answer — a USD-only fallback should retry next request.
  if (Object.keys(rates).length > 1) cache.set(RATES_CACHE_KEY, payload, RATES_CACHE_TTL_SECONDS);
  return res.json(payload);
});

export default router;
