// INTEGRATION CHECKLIST
// [ ] All API keys are loaded from .env (OpenRouter, Apify, RapidAPI, Google)
// [ ] SQLite vacation.db is created on first run
// [ ] Cache returns data on second request for same params
// [ ] Background refresh fires when cache is >2.5 hours old
// [ ] OpenRouter stream works end to end to frontend
// [ ] PDF export downloads a valid PDF
// [ ] JSON export downloads valid JSON
// [ ] Map shows pins for all result types
// [ ] Radius draw triggers a new filtered search
// [ ] Comparison table shows when 2+ hotels selected
// [ ] Real-time price polling fires every 60 seconds
// [ ] Model picker updates the active model context
// [ ] Random trip generates a destination and starts streaming
// [ ] Saved trips persist across server restart (SQLite)
// [ ] Flights only fetched when an origin is provided (search has no flight-search UI value otherwise)

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { db, cache } from '../db';
import { scrapeBooking } from '../scrapers/apify';
import { scrapeTripAdvisor } from '../scrapers/rapidapi/tripadvisor';
import { scrapeBookingHotels } from '../scrapers/rapidapi/booking';
import { scrapeFlights } from '../scrapers/rapidapi/flights';
import { scrapeHotels4, scrapeHotelsComProvider } from '../scrapers/rapidapi/hotels';
import { scrapeAirbnb } from '../scrapers/rapidapi/airbnb';
import { scrapeDuffelFlights } from '../scrapers/duffel';
import { scrapeIgnavFlights } from '../scrapers/ignav';
import { scrapeLiteApiHotels } from '../scrapers/liteapi';
import { scrapeGooglePlaces } from '../scrapers/google';

const router = Router();

const CHECK_TIMEOUT_MS = 6000;
const VERSION = '1.0.0';

function defaultDateRange(): { checkin: string; checkout: string } {
  const checkin = new Date();
  checkin.setDate(checkin.getDate() + 7);
  const checkout = new Date();
  checkout.setDate(checkout.getDate() + 14);
  return { checkin: checkin.toISOString().slice(0, 10), checkout: checkout.toISOString().slice(0, 10) };
}

// ---------------------------------------------------------------------------
// Per-service checks
// ---------------------------------------------------------------------------

async function checkOpenRouter(): Promise<boolean> {
  try {
    const res = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: CHECK_TIMEOUT_MS,
      }
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkApify(): Promise<boolean> {
  try {
    // Apify's real account-info endpoint is /v2/users/me (plural) and returns
    // the user object — it has no top-level "status" field, so "READY" can't
    // be checked literally. A 200 here is the meaningful success signal,
    // mirroring how every other check in this file works.
    const res = await axios.get(`https://api.apify.com/v2/users/me?token=${process.env.APIFY_API_KEY}`, {
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// RapidAPI spans three independently-subscribed products now — one boolean
// can't represent "TripAdvisor works but Booking doesn't," so each gets its
// own check, matching how a user would actually need to debug a failure.

async function checkRapidApiTripAdvisor(): Promise<boolean> {
  try {
    const res = await axios.get('https://tripadvisor16.p.rapidapi.com/api/v1/hotels/searchLocation', {
      params: { query: 'Paris' },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
        'X-RapidAPI-Host': 'tripadvisor16.p.rapidapi.com',
      },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkRapidApiBooking(): Promise<boolean> {
  try {
    const res = await axios.get('https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination', {
      params: { query: 'Paris' },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
        'X-RapidAPI-Host': 'booking-com15.p.rapidapi.com',
      },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkRapidApiFlights(): Promise<boolean> {
  try {
    const res = await axios.get('https://google-flights2.p.rapidapi.com/api/v1/searchAirport', {
      params: { query: 'Paris' },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
        'X-RapidAPI-Host': 'google-flights2.p.rapidapi.com',
      },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

// NOTE: the three checks below verify connectivity + subscription for their
// destination-resolution endpoint only — that's the half of each pipeline
// confirmed reliably working live. The actual listing/search step for all
// three is confirmed reachable but currently returns no usable data (see
// scrapers/rapidapi/hotels.ts and scrapers/rapidapi/airbnb.ts for details).
// A "true" here means "subscribed and reachable," not "returns hotels."

async function checkRapidApiHotels(): Promise<boolean> {
  try {
    const res = await axios.get('https://hotels4.p.rapidapi.com/locations/v3/search', {
      params: { q: 'Paris', locale: 'en_US' },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
        'X-RapidAPI-Host': 'hotels4.p.rapidapi.com',
      },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkRapidApiHotelsComProvider(): Promise<boolean> {
  try {
    const res = await axios.get('https://hotels-com-provider.p.rapidapi.com/v2/regions', {
      params: { query: 'Paris', domain: 'US', locale: 'en_US' },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
        'X-RapidAPI-Host': 'hotels-com-provider.p.rapidapi.com',
      },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkRapidApiAirbnb(): Promise<boolean> {
  try {
    const res = await axios.get('https://airbnb19.p.rapidapi.com/api/v1/searchDestination', {
      params: { query: 'Paris' },
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
        'X-RapidAPI-Host': 'airbnb19.p.rapidapi.com',
      },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkDuffel(): Promise<boolean> {
  try {
    const res = await axios.get('https://api.duffel.com/places/suggestions', {
      params: { query: 'Paris' },
      headers: {
        Authorization: `Bearer ${process.env.DUFFEL_API_KEY ?? ''}`,
        'Duffel-Version': 'v2',
      },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkIgnav(): Promise<boolean> {
  if (!process.env.IGNAV_API_KEY) return false;
  try {
    const res = await axios.get('https://ignav.com/api/airports', {
      params: { q: 'Paris', limit: 1 },
      headers: { 'X-Api-Key': process.env.IGNAV_API_KEY },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkLiteApi(): Promise<boolean> {
  if (!process.env.LITEAPI_API_KEY) return false;
  try {
    const res = await axios.get('https://api.liteapi.travel/v3.0/data/countries', {
      headers: { 'X-API-Key': process.env.LITEAPI_API_KEY },
      timeout: CHECK_TIMEOUT_MS,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function checkGoogle(): Promise<boolean> {
  try {
    const res = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      { textQuery: 'hotels in Paris' },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY ?? '',
          'X-Goog-FieldMask': 'places.id',
        },
        timeout: CHECK_TIMEOUT_MS,
      }
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

function checkSqlite(): boolean {
  try {
    const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    return row?.ok === 1;
  } catch {
    return false;
  }
}

function checkCache(): boolean {
  try {
    const testKey = '__health_check__';
    const testValue = `${Date.now()}`;
    cache.set(testKey, testValue, 5);
    const ok = cache.get(testKey) === testValue;
    cache.del(testKey);
    return ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

router.get('/', async (_req: Request, res: Response) => {
  const [
    openrouter,
    apify,
    rapidapi_tripadvisor,
    rapidapi_booking,
    rapidapi_flights,
    rapidapi_hotels,
    rapidapi_hotels_com_provider,
    rapidapi_airbnb,
    duffel,
    ignav,
    liteapi,
    google,
  ] = await Promise.all([
    checkOpenRouter(),
    checkApify(),
    checkRapidApiTripAdvisor(),
    checkRapidApiBooking(),
    checkRapidApiFlights(),
    checkRapidApiHotels(),
    checkRapidApiHotelsComProvider(),
    checkRapidApiAirbnb(),
    checkDuffel(),
    checkIgnav(),
    checkLiteApi(),
    checkGoogle(),
  ]);

  const sqlite = checkSqlite();
  const cacheOk = checkCache();

  const services = {
    openrouter,
    apify,
    rapidapi_tripadvisor,
    rapidapi_booking,
    rapidapi_flights,
    rapidapi_hotels,
    rapidapi_hotels_com_provider,
    rapidapi_airbnb,
    duffel,
    ignav,
    liteapi,
    google,
    sqlite,
    cache: cacheOk,
  };

  // Core infra (db/cache) failing means the app can't function at all — "down".
  // External provider failures with healthy core infra are just "degraded".
  const coreOk = sqlite && cacheOk;
  const allOk = coreOk && Object.values(services).every(Boolean);
  const status: 'ok' | 'degraded' | 'down' = !coreOk ? 'down' : allOk ? 'ok' : 'degraded';

  const stats = cache.getStats();

  return res.json({
    status,
    services,
    cache_stats: {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
    },
    uptime_seconds: Math.floor(process.uptime()),
    version: VERSION,
  });
});

// ---------------------------------------------------------------------------
// Dev dashboard — individual scraper test endpoints
// ---------------------------------------------------------------------------

router.get('/test/apify', async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const hotels = await scrapeBooking(destination, checkin, checkout);
    return res.json({ count: hotels.length, breakdown: { hotels: hotels.length }, sample: hotels[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/rapidapi-tripadvisor', async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const result = await scrapeTripAdvisor(destination, checkin, checkout);
    const all = [...result.hotels, ...result.activities, ...result.restaurants];
    return res.json({
      count: all.length,
      breakdown: { hotels: result.hotels.length, activities: result.activities.length, restaurants: result.restaurants.length },
      sample: all[0] ?? null,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/rapidapi-booking', async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const hotels = await scrapeBookingHotels(destination, checkin, checkout);
    return res.json({ count: hotels.length, breakdown: { hotels: hotels.length }, sample: hotels[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/rapidapi-flights', async (req: Request, res: Response) => {
  const origin = (req.query.origin as string) || 'New York';
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const flights = await scrapeFlights(origin, destination, checkin, checkout);
    return res.json({ count: flights.length, breakdown: { flights: flights.length }, sample: flights[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/rapidapi-hotels', async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const hotels = await scrapeHotels4(destination, checkin, checkout);
    return res.json({ count: hotels.length, breakdown: { hotels: hotels.length }, sample: hotels[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/rapidapi-hotels-com-provider', async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const hotels = await scrapeHotelsComProvider(destination, checkin, checkout);
    return res.json({ count: hotels.length, breakdown: { hotels: hotels.length }, sample: hotels[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/rapidapi-airbnb', async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const listings = await scrapeAirbnb(destination, checkin, checkout);
    return res.json({ count: listings.length, breakdown: { listings: listings.length }, sample: listings[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/duffel', async (req: Request, res: Response) => {
  const origin = (req.query.origin as string) || 'New York';
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const flights = await scrapeDuffelFlights(origin, destination, checkin, checkout);
    return res.json({ count: flights.length, breakdown: { flights: flights.length }, sample: flights[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/ignav', async (req: Request, res: Response) => {
  const origin = (req.query.origin as string) || 'New York';
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const flights = await scrapeIgnavFlights(origin, destination, checkin, checkout);
    return res.json({ count: flights.length, breakdown: { flights: flights.length }, sample: flights[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/liteapi', async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) || 'Paris';
  const { checkin, checkout } = defaultDateRange();
  try {
    const hotels = await scrapeLiteApiHotels(destination, checkin, checkout, { adults: 2 });
    return res.json({ count: hotels.length, breakdown: { hotels: hotels.length }, sample: hotels[0] ?? null });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/test/google', async (req: Request, res: Response) => {
  const destination = (req.query.destination as string) || 'Paris';
  try {
    const result = await scrapeGooglePlaces(destination);
    const all = [...result.hotels, ...result.activities, ...result.restaurants];
    return res.json({
      count: all.length,
      breakdown: { hotels: result.hotels.length, activities: result.activities.length, restaurants: result.restaurants.length },
      sample: all[0] ?? null,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
