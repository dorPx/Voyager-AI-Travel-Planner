# Changelog

## Unreleased

### Added — 10 features (currency, weather, history, sharing, dark mode & more)
- **Currency switcher.** A header dropdown shows every price in EUR, GBP, JPY, ILS,
  AUD, or CAD using keyless ECB rates (frankfurter.app, cached 12h, new
  `GET /api/currency/rates`). Conversions are display-only and rendered with "≈";
  USD stays authoritative, and a rates outage falls back to plain USD.
- **Weather for your dates.** Daily forecast chips (hi/lo, condition, rain chance) on
  the results page and per-day in the itinerary builder, via keyless Open-Meteo
  (new `GET /api/weather`, cached 3h). Dates beyond the ~16-day forecast window
  simply render nothing — no invented weather.
- **Hotel details modal.** A "Details" action on each hotel card opens a full view —
  photo, complete amenity list, rating, distance, price-history sparkline, Google
  Maps link, booking CTA — built entirely from already-fetched data.
- **Price history with trend badges.** Every fresh scrape (search, load-more, price
  poll) records observations to a new SQLite `price_history` table; cards and the
  details modal show "↓ 12% vs 3 days ago" badges plus a sparkline once a hotel has
  prior observations (new `POST /api/price-history`).
- **Trip budget tracker.** The itinerary builder's total bar gains an editable budget
  and a green→amber→red progress bar with a live "left / over" delta.
- **Calendar (.ics) export.** `GET /api/itinerary/:id/export?format=ics` produces an
  RFC 5545 calendar (one all-day event per trip day, escaped and line-folded);
  export buttons added in the builder and on saved trips.
- **Shareable read-only trips.** Every saved trip gets a `share_id` token (existing
  DBs migrated + backfilled); `GET /api/itinerary/shared/:shareId` and a new
  `/share/[shareId]` page render it read-only, with copy-link buttons in the builder
  and trip view.
- **Dark mode.** System / light / dark toggle in the header. The palette moved to
  CSS variables (including the `white` surface token), applied pre-hydration by an
  inline script so there is no flash; honors `prefers-color-scheme` live.
- **AI packing list.** A per-trip, weather- and activity-aware checklist
  (`POST /api/ai/packing-list`, OpenRouter) with a deterministic fallback when the
  key is missing or the model errors; checked items persist per trip in the browser.
- **Walking distances between stops.** Haversine "0.9 km · ~12 min walk" (or
  "~8 min drive") connectors between consecutive same-day stops in the builder and
  trip views — only when both stops have real coordinates.

### Added — "Load more" hotel pagination
- A **Load more hotels** button at the bottom of the hotel list fetches the next
  Booking.com results page (20 hotels per page, same "top picks" ordering and
  occupancy as the original search), annotates distance from center, and merges
  them into the current results — preserving active filters and sort, deduplicating
  by id and name. When a page returns nothing new, the button is replaced with
  "You've seen all available hotels for this search." Backed by a new
  `POST /api/search/more` endpoint (cached 3h, fail-soft: errors read as
  "no more results", never a 5xx).

### Added — 5 more UX improvements (search speed, clarity, resilience)
- **Keyboard-navigable destination search.** The autocomplete dropdown is now fully
  operable with the keyboard — arrow keys move the highlight, Enter selects, Escape
  closes — with proper ARIA combobox semantics (WCAG 2.1 AA).
- **Popular-destination quick chips.** New visitors see one-click city chips on the
  hero to start a search instantly; returning visitors see their recent searches
  instead. Both clear away once results are showing.
- **Retry on a failed search.** A network or provider error now shows a "Try again"
  button that re-runs the search, instead of dead-ending.
- **Source attribution.** The results header names the providers that actually
  contributed ("Comparing across Booking.com · Google …") — honest-data transparency.
- **Sticky search summary.** Scrolling into results reveals a compact bar with the
  active search (destination · dates · guests · count) and an "Edit" jump back to the
  search form.

### Added — 5 UX improvements
- **Shareable & refresh-safe searches.** The active search (destination, dates,
  occupancy) is written to the URL, so a search survives a page reload and can be
  bookmarked or shared. Opening such a URL rehydrates the form and re-runs the
  search automatically. The browser tab title reflects the destination.
- **Active filter chips.** Every applied filter (price range, review-score bucket,
  amenity, source) appears as a removable chip above the results, with a "Clear all"
  shortcut. When filters hide every hotel, a clear empty state with a one-click
  "Clear all filters" recovery replaces the silent blank list.
- **Save / favorite hotels.** A heart on each hotel card saves it to a wishlist
  persisted in the browser (localStorage). A "♥ Saved (n)" toggle in the results
  header filters the list to saved hotels; favorites survive reloads and new searches.
- **Recent searches.** Your last few searches appear as one-click chips under the
  search bar to re-run instantly (persisted locally, deduplicated).
- **Accessibility & motion.** Keyboard-visible `:focus-visible` rings on all controls
  (WCAG 2.1 AA 2.4.7), and every animation now honors the OS "reduce motion" setting
  (WCAG 2.1 AA 2.3.3).

## Earlier
- Hotel ranking: booking.com-style "top picks" blend (rating + price + distance),
  a "Distance from center" sort, distance shown on cards, and a fetch order that
  returns the top-recommended 20 hotels rather than the most expensive.
- Initial public release: travel meta-search + AI itinerary builder.
