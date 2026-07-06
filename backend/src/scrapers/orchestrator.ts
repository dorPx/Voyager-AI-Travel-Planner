import crypto from 'crypto';
import { db, cache } from '../db';
import { scrapeBooking } from './apify';
import { scrapeTripAdvisor } from './rapidapi/tripadvisor';
import { scrapeBookingHotels } from './rapidapi/booking';
import { scrapeFlights, dedupeFlights } from './rapidapi/flights';
import { scrapeHotelsProviders } from './rapidapi/hotels';
import { scrapeAirbnb } from './rapidapi/airbnb';
import { scrapeDuffelFlights } from './duffel';
import { scrapeIgnavFlights } from './ignav';
import { scrapeLiteApiHotels } from './liteapi';
import { scrapeGooglePlaces } from './google';
import { fillMissingHotelCoords, fillHotelDistances } from './geocode';
import { recordHotelPrices } from '../services/priceHistory.service';
import type {
  SearchParams,
  HotelResult,
  ActivityResult,
  FlightResult,
  RestaurantResult,
} from '../../../shared/types';

const REFRESH_THRESHOLD_MS = 2.5 * 60 * 60 * 1000; // 2.5 hours

// ---------------------------------------------------------------------------
// Cache key
// ---------------------------------------------------------------------------

export function makeCacheKey(params: SearchParams): string {
  return crypto.createHash('md5').update(JSON.stringify(params)).digest('hex');
}

// ---------------------------------------------------------------------------
// Serialized result shape (what we store)
// ---------------------------------------------------------------------------

export interface CachedPayload {
  hotels: HotelResult[];
  activities: ActivityResult[];
  flights: FlightResult[];
  restaurants: RestaurantResult[];
  cached_at: number;
}

// ---------------------------------------------------------------------------
// Cache read / write
// ---------------------------------------------------------------------------

export function readCache(key: string): CachedPayload | null {
  // 1. In-memory NodeCache
  const mem = cache.get<CachedPayload>(key);
  if (mem) return mem;

  // 2. SQLite
  const row = db
    .prepare('SELECT data_json, scraped_at FROM search_cache WHERE cache_key = ?')
    .get(key) as { data_json: string; scraped_at: number } | undefined;

  if (row) {
    try {
      const parsed = JSON.parse(row.data_json) as CachedPayload;
      // Ensure cached_at is available (older rows may not have it)
      parsed.cached_at = parsed.cached_at ?? row.scraped_at;
      // Warm the in-memory cache so the next request is instant
      cache.set(key, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

export function writeCache(key: string, payload: CachedPayload): void {
  cache.set(key, payload);
  db.prepare(
    'INSERT OR REPLACE INTO search_cache (cache_key, data_json, scraped_at, source) VALUES (?, ?, ?, ?)'
  ).run(key, JSON.stringify(payload), payload.cached_at, 'orchestrator');
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function dedupeHotels(hotels: HotelResult[]): HotelResult[] {
  const map = new Map<string, HotelResult>();
  for (const h of hotels) {
    const key = h.name.toLowerCase().trim();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...h });
      continue;
    }
    // Keep lowest price; collect additional booking URLs
    if (h.price_per_night > 0 && (existing.price_per_night === 0 || h.price_per_night < existing.price_per_night)) {
      existing.price_per_night = h.price_per_night;
    }
    if (h.booking_url && h.booking_url !== existing.booking_url) {
      existing.booking_url = existing.booking_url
        ? `${existing.booking_url} | ${h.booking_url}`
        : h.booking_url;
    }
    // Prefer non-zero coordinates
    if (!existing.lat && h.lat) existing.lat = h.lat;
    if (!existing.lng && h.lng) existing.lng = h.lng;
    // Prefer higher rating
    if (h.rating > existing.rating) existing.rating = h.rating;
    // Merge amenities
    const combined = [...new Set([...existing.amenities, ...h.amenities])];
    existing.amenities = combined.slice(0, 15);
  }
  return [...map.values()];
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core scrape
// ---------------------------------------------------------------------------

export async function runScrapers(params: SearchParams): Promise<CachedPayload> {
  const { destination, checkin, checkout, origin, adults, children, rooms } = params;
  const occupancy = { adults, children, rooms };

  const [apifyRes, rapidApiRes, bookingRapidRes, hotelsProvidersRes, airbnbRes, liteApiRes, googleRes, flightsRes, duffelRes, ignavRes] = await Promise.allSettled([
    scrapeBooking(destination, checkin, checkout),
    scrapeTripAdvisor(destination, checkin, checkout),
    scrapeBookingHotels(destination, checkin, checkout, occupancy),
    scrapeHotelsProviders(destination, checkin, checkout, occupancy),
    scrapeAirbnb(destination, checkin, checkout),
    scrapeLiteApiHotels(destination, checkin, checkout, occupancy),
    scrapeGooglePlaces(destination),
    // Flights need an origin — without one there's nothing meaningful to search for.
    origin ? scrapeFlights(origin, destination, checkin, checkout) : Promise.resolve([]),
    origin ? scrapeDuffelFlights(origin, destination, checkin, checkout) : Promise.resolve([]),
    origin ? scrapeIgnavFlights(origin, destination, checkin, checkout) : Promise.resolve([]),
  ]);

  const ap = apifyRes.status === 'fulfilled' ? apifyRes.value : [];
  const ra = rapidApiRes.status === 'fulfilled' ? rapidApiRes.value : { hotels: [], activities: [], restaurants: [] };
  const br = bookingRapidRes.status === 'fulfilled' ? bookingRapidRes.value : [];
  const hp = hotelsProvidersRes.status === 'fulfilled' ? hotelsProvidersRes.value : [];
  const ab = airbnbRes.status === 'fulfilled' ? airbnbRes.value : [];
  const la = liteApiRes.status === 'fulfilled' ? liteApiRes.value : [];
  const gp = googleRes.status === 'fulfilled' ? googleRes.value : { hotels: [], activities: [], restaurants: [] };
  const fl = flightsRes.status === 'fulfilled' ? flightsRes.value : [];
  const df = duffelRes.status === 'fulfilled' ? duffelRes.value : [];
  const ig = ignavRes.status === 'fulfilled' ? ignavRes.value : [];

  if (apifyRes.status === 'rejected') console.error('[orchestrator] apify failed:', apifyRes.reason);
  if (rapidApiRes.status === 'rejected') console.error('[orchestrator] rapidapi/tripadvisor failed:', rapidApiRes.reason);
  if (bookingRapidRes.status === 'rejected') console.error('[orchestrator] rapidapi/booking failed:', bookingRapidRes.reason);
  if (hotelsProvidersRes.status === 'rejected') console.error('[orchestrator] rapidapi/hotels failed:', hotelsProvidersRes.reason);
  if (airbnbRes.status === 'rejected') console.error('[orchestrator] rapidapi/airbnb failed:', airbnbRes.reason);
  if (liteApiRes.status === 'rejected') console.error('[orchestrator] liteapi failed:', liteApiRes.reason);
  if (googleRes.status === 'rejected') console.error('[orchestrator] google failed:', googleRes.reason);
  if (flightsRes.status === 'rejected') console.error('[orchestrator] rapidapi/flights failed:', flightsRes.reason);
  if (duffelRes.status === 'rejected') console.error('[orchestrator] duffel failed:', duffelRes.reason);
  if (ignavRes.status === 'rejected') console.error('[orchestrator] ignav failed:', ignavRes.reason);

  // LiteAPI first: it's the accuracy-first source (real content + live rates),
  // so it becomes the base record in dedupeHotels — its name/photo/rating win,
  // and a matching Booking.com/etc. entry merges in (contributing a booking_url
  // and a lower price if it has one).
  const allHotels = [...la, ...ap, ...ra.hotels, ...br, ...hp, ...ab, ...gp.hotels];
  const allActivities = [...ra.activities, ...gp.activities];
  const allRestaurants = [...ra.restaurants, ...gp.restaurants];

  // Backfill coordinates for hotels whose source didn't provide them
  // (TripAdvisor), so the map can pin every hotel — results are cached, so
  // this only costs lookups on the first search for a destination. Then
  // annotate distance from the destination center (one cached geocode) for
  // the "Distance from center" sort and card display.
  const hotels = await fillHotelDistances(
    await fillMissingHotelCoords(dedupeHotels(allHotels), destination),
    destination
  );

  // Cross-session price memory — every fresh scrape (initial search, poll
  // refresh, background refresh) contributes an observation.
  recordHotelPrices(destination, hotels);

  return {
    hotels,
    activities: dedupeByName(allActivities),
    flights: dedupeFlights([...fl, ...df, ...ig]),
    restaurants: dedupeByName(allRestaurants),
    cached_at: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Background refresh (non-blocking)
// ---------------------------------------------------------------------------

function scheduleBackgroundRefresh(key: string, params: SearchParams): void {
  setImmediate(async () => {
    try {
      console.log(`[orchestrator] background refresh for key ${key}`);
      const fresh = await runScrapers(params);
      writeCache(key, fresh);
      console.log(`[orchestrator] background refresh complete for key ${key}`);
    } catch (err: unknown) {
      console.error('[orchestrator] background refresh failed:', err instanceof Error ? err.message : err);
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeAll(params: SearchParams): Promise<{
  hotels: HotelResult[];
  activities: ActivityResult[];
  flights: FlightResult[];
  restaurants: RestaurantResult[];
}> {
  const key = makeCacheKey(params);

  // --- Cache hit path ---
  const cached = readCache(key);
  if (cached) {
    const age = Date.now() - (cached.cached_at ?? 0);
    if (age > REFRESH_THRESHOLD_MS) {
      // Data is getting stale — kick off a background refresh before the TTL expires
      scheduleBackgroundRefresh(key, params);
    }
    const { cached_at: _drop, ...result } = cached;
    return result;
  }

  // --- Cache miss path ---
  const fresh = await runScrapers(params);
  writeCache(key, fresh);

  const { cached_at: _drop, ...result } = fresh;
  return result;
}

export async function scrapeAllWithMeta(params: SearchParams): Promise<{
  hotels: HotelResult[];
  activities: ActivityResult[];
  flights: FlightResult[];
  restaurants: RestaurantResult[];
  cached: boolean;
  cache_age_minutes: number;
}> {
  const key = makeCacheKey(params);
  const cached = readCache(key);

  if (cached) {
    const ageMs = Date.now() - (cached.cached_at ?? 0);
    if (ageMs > REFRESH_THRESHOLD_MS) {
      scheduleBackgroundRefresh(key, params);
    }
    const { cached_at: _drop, ...result } = cached;
    return { ...result, cached: true, cache_age_minutes: Math.round(ageMs / 60000) };
  }

  const fresh = await runScrapers(params);
  writeCache(key, fresh);
  const { cached_at: _drop, ...result } = fresh;
  return { ...result, cached: false, cache_age_minutes: 0 };
}

export default scrapeAll;
