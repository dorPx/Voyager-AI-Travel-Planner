import { db } from '../db';
import type { HotelResult, PricePoint } from '../../../shared/types';

// Cross-session price memory. The in-session poller (search/live-prices) can
// only diff against the current cache window; this table remembers what a
// hotel cost days ago so cards can show an honest "cheaper/pricier than
// before" trend. Keyed by lowercased hotel name + destination — the same
// identity the orchestrator dedupes on, so it's stable across providers.

const MIN_REOBSERVE_MS = 6 * 60 * 60 * 1000; // identical prices re-recorded at most every 6h
const MAX_POINTS_PER_HOTEL = 12;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function hotelKey(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Records the current price of each priced hotel. A new row is written only
 * when the price changed or the last observation is stale, so repeat cache
 * hits don't flood the table. Never throws — history is supplementary.
 */
export function recordHotelPrices(destination: string, hotels: HotelResult[]): void {
  if (!destination || !hotels.length) return;
  try {
    const dest = destination.toLowerCase().trim();
    const latest = db.prepare(
      'SELECT price, observed_at FROM price_history WHERE destination = ? AND hotel_key = ? ORDER BY observed_at DESC LIMIT 1'
    );
    const insert = db.prepare(
      'INSERT INTO price_history (hotel_key, destination, price, observed_at) VALUES (?, ?, ?, ?)'
    );
    const now = Date.now();

    const writeAll = db.transaction((items: HotelResult[]) => {
      for (const h of items) {
        if (!(h.price_per_night > 0)) continue;
        const key = hotelKey(h.name);
        const last = latest.get(dest, key) as { price: number; observed_at: number } | undefined;
        if (last && last.price === h.price_per_night && now - last.observed_at < MIN_REOBSERVE_MS) continue;
        insert.run(key, dest, h.price_per_night, now);
      }
    });
    writeAll(hotels);
  } catch (err: unknown) {
    console.error('[price-history] record failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Recent observations (oldest first, capped, last 30 days) for a set of hotel
 * names in a destination. Missing hotels simply have no entry.
 */
export function getPriceHistory(destination: string, names: string[]): Record<string, PricePoint[]> {
  const out: Record<string, PricePoint[]> = {};
  if (!destination || !names.length) return out;
  try {
    const dest = destination.toLowerCase().trim();
    const select = db.prepare(
      `SELECT price, observed_at FROM price_history
       WHERE destination = ? AND hotel_key = ? AND observed_at >= ?
       ORDER BY observed_at DESC LIMIT ?`
    );
    const since = Date.now() - HISTORY_WINDOW_MS;
    for (const name of names.slice(0, 100)) {
      const key = hotelKey(name);
      const rows = select.all(dest, key, since, MAX_POINTS_PER_HOTEL) as PricePoint[];
      if (rows.length) out[key] = rows.reverse();
    }
  } catch (err: unknown) {
    console.error('[price-history] lookup failed:', err instanceof Error ? err.message : err);
  }
  return out;
}
