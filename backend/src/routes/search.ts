import { Router, Request, Response } from 'express';
import axios from 'axios';
import { db, cache } from '../db';
import {
  SearchParams,
  ActivityResult,
  RestaurantResult,
} from '../../../shared/types';
import {
  scrapeAllWithMeta,
  readCache,
  writeCache,
  runScrapers,
  makeCacheKey,
} from '../scrapers/orchestrator';
import { rapidApiHeaders } from '../scrapers/rapidapi/client';
import { scrapeBookingHotels } from '../scrapers/rapidapi/booking';
import { fillHotelDistances } from '../scrapers/geocode';
import { recordHotelPrices } from '../services/priceHistory.service';
import type { HotelResult } from '../../../shared/types';

const router = Router();

const LIVE_PRICE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// GET /api/search?q= — destination autocomplete
// Primary: booking-com15's searchDestination (fast, ~300ms), with city-type
// results ranked above districts/landmarks/airports so "New York" surfaces the
// city itself. Fallback: Google Geocoding (same key geocode.ts uses) when the
// booking host errors or is over quota — it returns 200 with a `message` body
// and no `data`, so absence of `data` must be treated as failure, and empty
// results are never cached (a cached [] used to blank every city for 24h).
// ---------------------------------------------------------------------------

interface DestinationSuggestion {
  name?: string;
  label?: string;
  city_name?: string;
  region?: string;
  country?: string;
  dest_type?: string;
  search_type?: string;
}

const PLACE_TYPES = new Set(['city', 'district', 'region', 'country']);

function suggestionType(item: DestinationSuggestion): string {
  return (item.search_type ?? item.dest_type ?? '').toLowerCase();
}

function isCityType(item: DestinationSuggestion): boolean {
  const type = suggestionType(item);
  return type === 'city' || type === 'region';
}

async function bookingDestinations(q: string): Promise<string[]> {
  const response = await axios.get<{ data?: DestinationSuggestion[] }>(
    'https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination',
    {
      params: { query: q },
      headers: rapidApiHeaders('booking-com15.p.rapidapi.com'),
      timeout: 6_000,
    }
  );

  // Quota/errors arrive as HTTP 200 with a `message` body and no `data`.
  const items = response.data?.data;
  if (!Array.isArray(items)) return [];

  // "Where to?" suggests places, not individual hotels/landmarks the endpoint
  // mixes in (querying a full label like "New York, New York, United States"
  // even puts the New York-New York Las Vegas hotel first).
  const places = items.filter((item) => PLACE_TYPES.has(suggestionType(item)));
  const ranked = [...(places.length ? places : items)].sort(
    (a, b) => Number(isCityType(b)) - Number(isCityType(a))
  );
  return ranked.map((item) => {
    if (item.label) return item.label;
    const primary = item.name ?? item.city_name ?? '';
    return [primary, item.region, item.country].filter(Boolean).join(', ');
  });
}

async function geocodeDestinations(q: string): Promise<string[]> {
  const response = await axios.get<{
    status?: string;
    results?: { formatted_address?: string; types?: string[] }[];
  }>('https://maps.googleapis.com/maps/api/geocode/json', {
    params: { address: q, key: process.env.GOOGLE_MAPS_API_KEY ?? '' },
    timeout: 6_000,
  });

  if (response.data.status !== 'OK') return [];
  const results = response.data.results ?? [];
  // Prefer place-like results (cities, regions, countries) over street addresses.
  const places = results.filter((r) => r.types?.includes('political'));
  return (places.length ? places : results).map((r) => r.formatted_address ?? '');
}

router.get('/', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) return res.status(400).json({ error: 'Missing query param: q' });

  const cacheKey = `autocomplete:${q.toLowerCase()}`;
  const cached = cache.get<string[]>(cacheKey);
  if (cached) return res.json({ suggestions: cached });

  let names: string[] = [];
  try {
    names = await bookingDestinations(q);
  } catch {
    // fall through to geocoding
  }
  if (!names.length) {
    try {
      names = await geocodeDestinations(q);
    } catch {
      // Autocomplete is a convenience — degrade to no suggestions, never an error.
    }
  }

  const suggestions = [...new Set(names.filter((s) => s.length > 1))].slice(0, 8);
  if (suggestions.length) cache.set(cacheKey, suggestions, 24 * 60 * 60);
  return res.json({ suggestions });
});

// ---------------------------------------------------------------------------
// POST /api/search — full orchestrated search
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response) => {
  const params: SearchParams = req.body;

  if (!params?.destination || !params?.checkin || !params?.checkout) {
    return res.status(400).json({
      error: 'Missing required fields: destination, checkin, checkout are all required.',
    });
  }

  try {
    const result = await scrapeAllWithMeta(params);
    return res.json(result);
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/search/more — "Load more" hotel pagination
// Fetches the next Booking.com results page (20 hotels, same "top picks"
// order and occupancy as the original search) and annotates distances. Only
// Booking paginates; other sources contributed their full sets on page 1.
// Fail-soft: any upstream error returns an empty list, never a 5xx.
// ---------------------------------------------------------------------------

const MORE_CACHE_TTL_SECONDS = 3 * 60 * 60; // match the main search cache window

router.post('/more', async (req: Request, res: Response) => {
  const { destination, checkin, checkout, adults, children, rooms, page } = req.body as SearchParams & {
    page?: number;
  };

  if (!destination || !checkin || !checkout) {
    return res.status(400).json({
      error: 'Missing required fields: destination, checkin, checkout are all required.',
    });
  }

  // Page 1 belongs to the main search; "more" starts at 2.
  const pageNum = Math.max(2, Math.round(Number(page) || 2));
  const cacheKey = `search-more:${destination.toLowerCase()}:${checkin}:${checkout}:${adults ?? 2}:${children ?? 0}:${rooms ?? 1}:${pageNum}`;

  const cached = cache.get<HotelResult[]>(cacheKey);
  if (cached) {
    console.log(`[search/more] cache hit: ${cacheKey}`);
    return res.json({ hotels: cached, page: pageNum });
  }

  try {
    const hotels = await scrapeBookingHotels(destination, checkin, checkout, { adults, children, rooms }, pageNum);
    await fillHotelDistances(hotels, destination);
    recordHotelPrices(destination, hotels);
    cache.set(cacheKey, hotels, MORE_CACHE_TTL_SECONDS);
    console.log(`[search/more] ${destination} page ${pageNum}: ${hotels.length} hotels`);
    return res.json({ hotels, page: pageNum });
  } catch (err: unknown) {
    // Supplementary pagination — degrade to "no more results" rather than erroring.
    console.error('[search/more] failed:', err instanceof Error ? err.message : err);
    return res.json({ hotels: [], page: pageNum });
  }
});

// ---------------------------------------------------------------------------
// GET /api/search/live-prices — lightweight polling endpoint
// ---------------------------------------------------------------------------

router.get('/live-prices', async (req: Request, res: Response) => {
  const { destination, checkin, checkout } = req.query as {
    destination?: string;
    checkin?: string;
    checkout?: string;
  };

  if (!destination || !checkin || !checkout) {
    return res.status(400).json({
      error: 'Missing required query params: destination, checkin, checkout are all required.',
    });
  }

  const params: SearchParams = { destination, checkin, checkout };
  const key = makeCacheKey(params);
  const cached = readCache(key);

  if (!cached) {
    // Nothing cached yet — nothing to diff against. Trigger a scrape and return no changes.
    const fresh = await runScrapers(params);
    writeCache(key, fresh);
    return res.json({ price_changes: [] });
  }

  const age = Date.now() - (cached.cached_at ?? 0);
  if (age < LIVE_PRICE_THRESHOLD_MS) {
    // Cache is fresh enough — no re-scrape needed
    return res.json({ price_changes: [] });
  }

  try {
    const fresh = await runScrapers(params);

    const priceChanges: Array<{ id: string; old_price: number; new_price: number; source: string }> = [];

    const oldHotelsById = new Map(cached.hotels.map((h) => [h.id, h]));
    for (const h of fresh.hotels) {
      const old = oldHotelsById.get(h.id);
      if (old && old.price_per_night !== h.price_per_night && h.price_per_night > 0) {
        priceChanges.push({
          id: h.id,
          old_price: old.price_per_night,
          new_price: h.price_per_night,
          source: h.source,
        });
      }
    }

    const oldActivitiesById = new Map(cached.activities.map((a) => [a.id, a]));
    for (const a of fresh.activities) {
      const old = oldActivitiesById.get(a.id);
      if (old && old.price !== a.price && a.price > 0) {
        priceChanges.push({ id: a.id, old_price: old.price, new_price: a.price, source: a.source });
      }
    }

    writeCache(key, fresh);
    return res.json({ price_changes: priceChanges });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------------------------------------------------------------------------
// Legacy single-source endpoints (kept for direct/manual use).
//
// The old /hotels (booking-com.p.rapidapi.com) and /flights (sky-scrapper.p.rapidapi.com,
// called with unresolved raw origin/destination strings as literal skyIds) routes
// were removed here: neither had any frontend caller, and both were confirmed dead —
// the Booking.com host returns 403 "not subscribed", and the flights route never
// correctly resolved airport codes in the first place. Real, working replacements
// for both now live in scrapers/rapidapi/booking.ts and scrapers/rapidapi/flights.ts,
// wired into the main orchestrator pipeline.
// ---------------------------------------------------------------------------

function cacheKey(prefix: string, params: object): string {
  return `${prefix}:${JSON.stringify(params)}`;
}

function getCached<T>(key: string): T | null {
  const mem = cache.get<T>(key);
  if (mem) return mem;
  const row = db.prepare('SELECT data_json FROM search_cache WHERE cache_key = ?').get(key) as { data_json: string } | undefined;
  if (row) {
    try {
      const parsed = JSON.parse(row.data_json) as T;
      cache.set(key, parsed);
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function setCached(key: string, data: unknown, source: string): void {
  cache.set(key, data);
  db.prepare(
    'INSERT OR REPLACE INTO search_cache (cache_key, data_json, scraped_at, source) VALUES (?, ?, ?, ?)'
  ).run(key, JSON.stringify(data), Date.now(), source);
}

router.post('/activities', async (req: Request, res: Response) => {
  const params: SearchParams = req.body;
  const key = cacheKey('activities', params);
  const cached = getCached<ActivityResult[]>(key);
  if (cached) return res.json({ data: cached, cached: true });

  try {
    const apifyKey = process.env.APIFY_API_KEY!;
    const runRes = await axios.post(
      `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${apifyKey}&timeout=30`,
      {
        searchStringsArray: [`things to do in ${params.destination}`],
        maxCrawledPlacesPerSearch: 20,
        language: 'en',
      }
    );

    const activities: ActivityResult[] = (runRes.data ?? []).slice(0, 20).map((a: Record<string, unknown>, i: number) => ({
      id: String(a.placeId ?? i),
      name: String(a.title ?? ''),
      category: String((a.categoryName as string) ?? 'Attraction'),
      price: 0,
      rating: Number(a.totalScore ?? 0),
      duration_hours: 2,
      lat: Number((a.location as Record<string, number>)?.lat ?? 0),
      lng: Number((a.location as Record<string, number>)?.lng ?? 0),
      description: String(a.description ?? ''),
      source: 'google-places',
    }));

    setCached(key, activities, 'google-places');
    return res.json({ data: activities, cached: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

router.post('/restaurants', async (req: Request, res: Response) => {
  const params: SearchParams = req.body;
  const key = cacheKey('restaurants', params);
  const cached = getCached<RestaurantResult[]>(key);
  if (cached) return res.json({ data: cached, cached: true });

  try {
    const apifyKey = process.env.APIFY_API_KEY!;
    const runRes = await axios.post(
      `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${apifyKey}&timeout=30`,
      {
        searchStringsArray: [`restaurants in ${params.destination}`],
        maxCrawledPlacesPerSearch: 20,
        language: 'en',
      }
    );

    const restaurants: RestaurantResult[] = (runRes.data ?? []).slice(0, 20).map((r: Record<string, unknown>, i: number) => ({
      id: String(r.placeId ?? i),
      name: String(r.title ?? ''),
      cuisine: String((r.categoryName as string) ?? 'Restaurant'),
      price_level: Number(r.priceLevel ?? 2),
      rating: Number(r.totalScore ?? 0),
      lat: Number((r.location as Record<string, number>)?.lat ?? 0),
      lng: Number((r.location as Record<string, number>)?.lng ?? 0),
      source: 'google-places',
    }));

    setCached(key, restaurants, 'google-places');
    return res.json({ data: restaurants, cached: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

export default router;
