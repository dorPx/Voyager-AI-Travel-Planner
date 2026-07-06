// Maps an internal source id (e.g. "hotels.com-provider") to a display label.
// Shared by HotelCard (per-card badge) and the results header source line.
export function sourceLabel(source: string): string {
  if (/booking/i.test(source)) return 'Booking.com';
  if (/tripadvisor/i.test(source)) return 'TripAdvisor';
  // Check the more specific "-provider" variant before the plain one, since
  // "hotels.com-provider" would otherwise also match a generic /hotels\.com/ test.
  if (/hotels\.com-provider/i.test(source)) return 'Hotels.com Provider';
  if (/hotels\.com/i.test(source)) return 'Hotels.com';
  if (/airbnb/i.test(source)) return 'Airbnb';
  if (/liteapi/i.test(source)) return 'LiteAPI';
  if (/google/i.test(source)) return 'Google';
  return source;
}

/** Distinct, human-readable source labels across the given items, order-preserving. */
export function distinctSourceLabels(items: { source: string }[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const item of items) {
    const label = sourceLabel(item.source);
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}
