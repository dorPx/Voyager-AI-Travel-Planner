import type {
  HotelResult,
  ActivityResult,
  RestaurantResult,
  ItineraryDay,
  TripItinerary,
} from '../../../shared/types';

// ---------------------------------------------------------------------------
// Local builder model — richer than the wire-format ItineraryDay (which has
// no time-of-day segmentation). Converted to ItineraryDay only at save time.
// ---------------------------------------------------------------------------

export type TimeSlot = 'morning' | 'afternoon' | 'evening';

export type TimeSlotItem =
  | { kind: 'hotel'; item: HotelResult }
  | { kind: 'activity'; item: ActivityResult }
  | { kind: 'restaurant'; item: RestaurantResult };

export interface DayBuilderDay {
  day: number;
  date: string;
  morning: TimeSlotItem[];
  afternoon: TimeSlotItem[];
  evening: TimeSlotItem[];
}

export const TIME_SLOTS: TimeSlot[] = ['morning', 'afternoon', 'evening'];

export function emptyDay(dayNumber: number, date: string): DayBuilderDay {
  return { day: dayNumber, date, morning: [], afternoon: [], evening: [] };
}

// ---------------------------------------------------------------------------
// Date math
// ---------------------------------------------------------------------------

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function seedDates(startDate: string, numDays: number): string[] {
  const base = startDate || new Date().toISOString().slice(0, 10);
  return Array.from({ length: Math.max(1, numDays) }).map((_, i) => addDays(base, i));
}

// ---------------------------------------------------------------------------
// Cost calculation — single source of truth, used for both the live per-day
// display and the ItineraryDay.estimated_cost sent to the backend, so the
// two never diverge. Restaurant proxy cost matches backend's own
// itinerary.service.ts bestValueId heuristic (Math.max(price_level,1) * 20).
// ---------------------------------------------------------------------------

const RESTAURANT_COST_PER_LEVEL = 20;

export function dayCost(day: DayBuilderDay): number {
  let cost = 0;
  let hotelCounted = false;

  for (const slot of [...day.morning, ...day.afternoon, ...day.evening]) {
    if (slot.kind === 'hotel') {
      if (!hotelCounted) {
        cost += slot.item.price_per_night;
        hotelCounted = true;
      }
    } else if (slot.kind === 'activity') {
      cost += slot.item.price;
    } else {
      cost += Math.max(slot.item.price_level, 1) * RESTAURANT_COST_PER_LEVEL;
    }
  }

  return cost;
}

export function tripCost(days: DayBuilderDay[]): number {
  return days.reduce((sum, d) => sum + dayCost(d), 0);
}

export function dayHasHotel(day: DayBuilderDay): boolean {
  return [...day.morning, ...day.afternoon, ...day.evening].some((s) => s.kind === 'hotel');
}

// ---------------------------------------------------------------------------
// Distances between consecutive stops — straight-line haversine, shown as
// "0.9 km · ~12 min walk" connectors. Hints only appear when both stops have
// real coordinates; nothing is ever estimated from a missing lat/lng.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;
const WALK_KMH = 4.8;
const DRIVE_KMH = 30; // urban average, good enough for a hint
const MAX_WALK_KM = 2.5;

interface LatLng {
  lat: number;
  lng: number;
}

function hasCoords(p: LatLng): boolean {
  return Boolean(p.lat || p.lng);
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Human-readable travel hint between two stops, or null when either lacks
 * coordinates or they're effectively at the same spot.
 */
export function transitHint(from: LatLng, to: LatLng): string | null {
  if (!hasCoords(from) || !hasCoords(to)) return null;
  const km = haversineKm(from, to);
  if (km < 0.05) return null;

  const distance = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  if (km <= MAX_WALK_KM) {
    const minutes = Math.max(1, Math.round((km / WALK_KMH) * 60));
    return `${distance} · ~${minutes} min walk`;
  }
  const minutes = Math.max(1, Math.round((km / DRIVE_KMH) * 60));
  return `${distance} · ~${minutes} min drive`;
}

/** Flattens a builder day into its display order (morning → afternoon → evening). */
export function dayItemsInOrder(day: DayBuilderDay): TimeSlotItem[] {
  return [...day.morning, ...day.afternoon, ...day.evening];
}

// ---------------------------------------------------------------------------
// Conversion to the backend's wire format
// ---------------------------------------------------------------------------

export function toItineraryDay(day: DayBuilderDay): ItineraryDay {
  const all = [...day.morning, ...day.afternoon, ...day.evening];

  const hotel = all.find((i): i is Extract<TimeSlotItem, { kind: 'hotel' }> => i.kind === 'hotel')?.item;
  const activities = all
    .filter((i): i is Extract<TimeSlotItem, { kind: 'activity' }> => i.kind === 'activity')
    .map((i) => i.item);
  const meals = all
    .filter((i): i is Extract<TimeSlotItem, { kind: 'restaurant' }> => i.kind === 'restaurant')
    .map((i) => i.item);

  return { day: day.day, date: day.date, hotel, activities, meals, estimated_cost: dayCost(day) };
}

export function toTripItinerary(
  days: DayBuilderDay[],
  destination: string,
  tripType: string,
  name: string
): Omit<TripItinerary, 'id'> {
  return {
    name: name || `${destination} Trip`,
    destination,
    trip_type: tripType,
    total_cost: tripCost(days),
    days: days.map(toItineraryDay),
  };
}

// ---------------------------------------------------------------------------
// Streamed AI text — one tokenizer shared by the renderer (StreamedMarkdown)
// and the "adopt into builder" parser (parseDayCount), so highlighting and
// day-count extraction can never disagree about what a line means.
// ---------------------------------------------------------------------------

export type LineType = 'day-header' | 'cost' | 'plain' | 'blank';

export interface ClassifiedLine {
  type: LineType;
  dayNumber?: number;
  /** Markdown leaders (#, **) stripped, ready to display. */
  cleanedText: string;
}

export function classifyLine(rawLine: string): ClassifiedLine {
  const trimmed = rawLine.trim();
  if (!trimmed) return { type: 'blank', cleanedText: '' };

  const dayMatch = trimmed.match(/^#{0,3}\s*Day\s+(\d+)/i);
  const cleanedText = trimmed.replace(/^#{1,3}\s*/, '').replace(/\*\*/g, '');

  if (dayMatch) {
    return { type: 'day-header', dayNumber: parseInt(dayMatch[1], 10), cleanedText };
  }

  // The AI's actual output uses "**Daily Cost: $X**" / "## Grand Total: $X" —
  // matched leniently here rather than a strict startsWith("Cost:"), since a
  // literal prefix check would never match the real markdown formatting.
  const isCost = /\b(cost|total)\s*:/i.test(trimmed) && trimmed.length < 140;
  if (isCost) {
    return { type: 'cost', cleanedText };
  }

  return { type: 'plain', cleanedText };
}

/** Counts unique "Day N" headers in the streamed text, robust to a model skipping/repeating numbers. */
export function parseDayCount(streamedText: string): number {
  const dayNumbers = new Set<number>();
  for (const line of streamedText.split('\n')) {
    const classified = classifyLine(line);
    if (classified.type === 'day-header' && typeof classified.dayNumber === 'number') {
      dayNumbers.add(classified.dayNumber);
    }
  }
  if (dayNumbers.size === 0) return 1;
  return Math.max(...dayNumbers);
}
