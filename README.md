# Voyager — AI Vacation Planner

Travel meta-search and itinerary builder. Search a destination with dates, compare real
hotels, flights, activities, and restaurants pulled live from multiple providers, then let
an AI planner stream a day-by-day itinerary built from that live data — and save or export
the result.

## Features

- **Multi-source hotel search** — Booking.com, Hotels.com, Airbnb, TripAdvisor, Google
  Places, and **LiteAPI** (real content + live rates from 2M+ properties in one call),
  deduplicated and normalized, with booking.com-style filters (budget slider,
  review-score buckets with live counts, amenities, source) and sorting, plus a
  **"Load more hotels"** button that pages in 20 more Booking.com results at a time
  (filters and sort preserved)
- **Flights** (optional "flying from" field) via Google Flights / Sky Scrapper / Duffel /
  Ignav — all merged and deduplicated into one flight list
- **Activities & restaurants** from Google Places and TripAdvisor
- **Ranking that recommends, not upsells** — the default "top picks" sort blends rating,
  price, and distance from center; sort also by highest rated, distance, or price
- **Map view** with synced markers, radius-draw search, and hotel hover highlighting
- **Compare tray** for side-by-side hotel comparison, plus live price polling with
  price-drop badges
- **Save hotels** to a wishlist (persisted locally) with a saved-only view toggle
- **Shareable, refresh-safe searches** — the search lives in the URL and rehydrates on
  reload; recent searches and popular destinations are one click away, and applied
  filters show as removable chips
- **Fast, resilient search UX** — fully keyboard-navigable destination autocomplete, a
  "Try again" retry on failed searches, provider attribution on results, and a sticky
  search-summary bar on scroll
- **Accessible** — keyboard-visible focus rings, ARIA combobox autocomplete, and full
  `prefers-reduced-motion` support (WCAG 2.1 AA)
- **Price history & trends** — every scrape records prices to SQLite, so hotel cards can
  show an honest "↓ 12% vs 3 days ago" badge and a sparkline once a hotel has been seen
  before (complements the in-session price-drop polling with cross-session memory)
- **Hotel details modal** — full amenity list, rating breakdown, distance, price-history
  sparkline, and a Google Maps link, all from already-fetched data (no extra provider call)
- **Currency switcher** — view every price in EUR, GBP, JPY, ILS, AUD, or CAD (keyless
  ECB rates via frankfurter.app, cached 12h); conversions are display-only and marked "≈" —
  the bookable USD price stays authoritative
- **Weather for your dates** — daily forecast chips on the results page and per-day in the
  itinerary builder (keyless Open-Meteo, up to 16 days out; unforecastable dates simply
  render nothing)
- **Trip budget tracker** — set a budget in the itinerary builder and watch a
  green→amber→red bar fill with a live "left / over" delta as you add stays, meals, and
  activities
- **Walking distances between stops** — "0.9 km · ~12 min walk" (or drive-time) connectors
  between consecutive itinerary stops, computed from real coordinates and hidden when
  coordinates are missing — never guessed
- **Share a trip** — every saved itinerary gets a public read-only `/share/<token>` link,
  one click to copy
- **Calendar export** — download any saved itinerary as `.ics` (one all-day event per trip
  day, RFC 5545-compliant) alongside the existing JSON and PDF exports
- **AI packing list** — a weather- and activity-aware checklist per saved trip
  (OpenRouter), with a deterministic fallback when the key is missing; checked items
  persist locally
- **Dark mode** — system / light / dark toggle in the header, persisted, flash-free on
  load, honoring `prefers-color-scheme`
- **AI itinerary builder** — streams a day-by-day, budget-constrained itinerary over SSE
  using the real scraped prices (OpenRouter, model selectable in the UI)
- **Supplementary AI trip planner** — a second AI source (RapidAPI) whose day plans are
  woven into the itinerary; free-text interests ("foodie", "want to chill") are classified
  onto the provider's closed vocabulary by a small LLM with a deterministic fallback
- **Fail-soft by design** — every data source degrades independently; a missing key or a
  provider outage drops that source, never the app

## Architecture

```
frontend/   Next.js 14 (App Router, Tailwind), port 3000
backend/    Express + TypeScript, port 4000 — scrapers, caching, AI orchestration
shared/     types imported by both sides
```

Persistence is SQLite (`better-sqlite3`); hot caching is in-process (`node-cache`).
The backend aggregates all providers per search, caches results (~3h TTL), and serves
the SSE itinerary stream at `POST /api/recommend/stream`.

## Quick start

### Prerequisites

- Node.js 22+ (local dev) or Docker
- API keys — see the table below. You don't need all of them to boot; sources without
  keys simply drop out. The minimum for a useful experience is **RapidAPI + Google Maps**.

### 1. Configure environment

```bash
cp backend/.env.example backend/.env          # backend keys
cp .env.example .env                          # Docker build args (NEXT_PUBLIC_*)
cp frontend/.env.local.example frontend/.env.local   # only needed for local (non-Docker) dev
```

Fill in the values per the table below.

### 2a. Run with Docker (production-style build)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000 · Backend: http://localhost:4000
- SQLite persists in the `vacation-db` named volume (`docker compose down -v` resets it)

### 2b. Run locally (dev, hot reload)

```bash
npm run install:all
npm run dev        # backend :4000 + frontend :3000 via concurrently
```

## API keys — what powers what, and where to get each

| Variable | Powers | Where to get it |
|---|---|---|
| `RAPIDAPI_KEY` | Hotels, destination autocomplete, flights, Airbnb, TripAdvisor, and the supplementary AI trip planner | [rapidapi.com](https://rapidapi.com) — one key for all APIs, but **subscribe to each API** you want (see list below) |
| `RAPIDAPI_TRIP_PLANNER_HOST` | Host for the AI Trip Planner API | Leave the default (`ai-trip-planner.p.rapidapi.com`) |
| `OPENROUTER_API_KEY` | AI itinerary streaming + interest classification | [openrouter.ai](https://openrouter.ai) → Keys (pay-as-you-go) |
| `OPENROUTER_MODEL` | Default itinerary model | Any OpenRouter chat model id, e.g. `anthropic/claude-sonnet-4.5` |
| `OPENROUTER_CLASSIFIER_MODEL` | Cheap model for interest classification | e.g. `anthropic/claude-haiku-4.5` |
| `GOOGLE_MAPS_API_KEY` | Backend: Places search (hotels/activities/restaurants), Geocoding backfill, place photos | [Google Cloud console](https://console.cloud.google.com) → create key; enable **Places API (New)** and **Geocoding API** |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Frontend: the interactive map | Same console; enable **Maps JavaScript API**. Can be the same key or (better) a separate one |
| `APIFY_API_KEY` | Google Places crawler for activities/restaurants | [apify.com](https://apify.com) → Settings → API tokens |
| `DUFFEL_API_KEY` | Flight offers | [duffel.com](https://duffel.com) — a `duffel_test_` key returns realistic synthetic offers |
| `IGNAV_API_KEY` | Flight fares (an extra flight source; **flights only**, no hotels) | [ignav.com](https://ignav.com) — free tier is 1,000 requests; leave blank to disable |
| `LITEAPI_API_KEY` | Hotel content + live rates (name, photo, geo, guest score, price — the richest hotel source) | [liteapi.travel](https://liteapi.travel) — a `sand_` key returns sandbox test data, a prod key real inventory; leave blank to disable |
| `NEXT_PUBLIC_API_URL` | Where the browser reaches the backend | `http://localhost:4000` unless you moved it |
| `PORT`, `CACHE_TTL_SECONDS`, `CORS_ORIGIN`, `OPENROUTER_FALLBACK_MODEL` | Optional tuning | Sensible defaults in code |

Weather (Open-Meteo) and currency rates (frankfurter.app / ECB) are **keyless** — they
work on every install with no configuration and fail soft like every other source.

**RapidAPI subscriptions used** (all under your one `RAPIDAPI_KEY`): `booking-com15`
(hotels + destination search — the workhorse; a paid tier is recommended, free tier quota
runs out fast), `ai-trip-planner` (supplementary plans, ~5,000 req/month tier is plenty —
responses are cached 6h), `hotels4`, `hotels-com-provider`, `airbnb19`, `tripadvisor16`,
`google-flights2`, `sky-scrapper`. Subscribe only to what you want; unsubscribed sources
fail soft.

### Google Maps key safety

Places photo URLs embed the backend key as a query parameter by design, and the frontend
key ships in the browser bundle. **Restrict both keys in the Google Cloud console**: give
the frontend key an HTTP-referrer restriction, and restrict both keys to only the APIs
listed above.

## Useful bits

- `backend/scripts/test-rapidapi.js` — dev-only smoke test for the AI trip planner
  integration (classifier mapping, live fetch, cache-hit proof): `cd backend && node scripts/test-rapidapi.js`
- `docs/rapidapi-trip-planner-schema.md` — the AI Trip Planner API's verified schema,
  including its closed interests vocabulary and how it was probed
- `POST /api/recommend/stream` accepts `useSupplementarySources: true` (plus optional
  free-text `interests: []`) to enrich itineraries with the supplementary planner

## License

[MIT](LICENSE)
