import { Router, Request, Response } from 'express';
import { scrapeFlights, dedupeFlights } from '../scrapers/rapidapi/flights';
import { scrapeDuffelFlights } from '../scrapers/duffel';
import { scrapeIgnavFlights } from '../scrapers/ignav';
import { cache } from '../db';
import type { FlightResult } from '../../../shared/types';

const router = Router();

// POST /api/flights/search — standalone flight search for the Flights tab.
// Aggregates the flight providers already wired in (Google Flights/Sky-Scrapper,
// Duffel, Ignav), deduplicates, and attaches a bookable Google Flights deep link
// for the route so every result links somewhere the user can actually book.
//
// NOTE: this is the working baseline. When a dedicated flight API key is
// provided it can be slotted in here as another source (or replace these),
// and its own per-offer booking links used in place of the route-level link.

const FLIGHTS_CACHE_TTL_SECONDS = 60 * 60;

function googleFlightsLink(origin: string, destination: string, depart: string, ret?: string): string {
  const q = `Flights from ${origin} to ${destination} on ${depart}${ret ? ` returning ${ret}` : ''}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

router.post('/search', async (req: Request, res: Response) => {
  const { origin, destination, depart, return: ret } = req.body as {
    origin?: string;
    destination?: string;
    depart?: string;
    return?: string;
  };

  if (!origin || !destination || !depart) {
    return res.status(400).json({ error: 'Missing required fields: origin, destination, depart.' });
  }

  // Providers are round-trip oriented; default a return a week out when omitted.
  const returnDate = ret || (() => {
    const d = new Date(depart);
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  const cacheKey = `flights:${origin.toLowerCase()}:${destination.toLowerCase()}:${depart}:${returnDate}`;
  const cached = cache.get<FlightResult[]>(cacheKey);
  if (cached) return res.json({ flights: cached, cached: true });

  const bookingUrl = googleFlightsLink(origin, destination, depart, ret);

  const [rapid, duffel, ignav] = await Promise.allSettled([
    scrapeFlights(origin, destination, depart, returnDate),
    scrapeDuffelFlights(origin, destination, depart, returnDate),
    scrapeIgnavFlights(origin, destination, depart, returnDate),
  ]);

  const merged = dedupeFlights([
    ...(rapid.status === 'fulfilled' ? rapid.value : []),
    ...(duffel.status === 'fulfilled' ? duffel.value : []),
    ...(ignav.status === 'fulfilled' ? ignav.value : []),
  ])
    .map((f) => ({ ...f, booking_url: f.booking_url || bookingUrl }))
    .sort((a, b) => (a.price || Number.MAX_SAFE_INTEGER) - (b.price || Number.MAX_SAFE_INTEGER));

  if (merged.length) cache.set(cacheKey, merged, FLIGHTS_CACHE_TTL_SECONDS);
  return res.json({ flights: merged, cached: false });
});

export default router;
