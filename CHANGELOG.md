# Changelog

## Unreleased

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
