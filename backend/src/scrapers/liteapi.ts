import axios from 'axios';
import { geocode } from './geocode';
import type { HotelResult } from '../../../shared/types';

// LiteAPI (Nuitée) — real hotel content + live rates in a single call. Unlike
// the RapidAPI hotel sources, one POST /hotels/rates returns both a `hotels`
// content array (name, photo, geo, stars, guest score) and a `data` rates
// array (per-hotel offers), joined on the hotel id. We drive it by lat/lng —
// the destination is geocoded once (cached) via the same helper the rest of
// the pipeline uses — so there's no brittle city/country parsing.
//
// Fail-soft: a missing LITEAPI_API_KEY, an ungeocodable destination, or any
// upstream error degrades to zero hotels, never an error.
//
// Prices come back as the whole-stay retail total in USD (the app's
// authoritative currency; the UI converts for display). booking_url is left
// empty because LiteAPI has no public deep link — booking runs through its
// prebook/book API, which is out of scope here — so the card shows the price
// and details without inventing a link.

const BASE = 'https://api.liteapi.travel/v3.0';
const SEARCH_RADIUS_M = 20_000;
const MAX_HOTELS = 30;

interface Occupancy {
  adults?: number;
  children?: number;
  rooms?: number;
}

function liteApiHeaders(): Record<string, string> {
  return {
    'X-API-Key': process.env.LITEAPI_API_KEY ?? '',
    'Content-Type': 'application/json',
  };
}

function nightsBetween(checkin: string, checkout: string): number {
  const ms = new Date(checkout).getTime() - new Date(checkin).getTime();
  if (Number.isNaN(ms) || ms <= 0) return 1;
  return Math.max(1, Math.round(ms / 86400000));
}

/** One occupancy object per room; children passed as ages (the app has counts
 *  only, so a neutral default age is used). Adults spread ≥1 per room. */
function buildOccupancies(occ: Occupancy): Array<{ adults: number; children: number[] }> {
  const rooms = Math.max(1, Math.round(occ.rooms ?? 1));
  const adults = Math.max(rooms, Math.round(occ.adults ?? 2)); // ≥1 adult per room
  const children = Math.max(0, Math.round(occ.children ?? 0));
  const childAges = Array.from({ length: children }, () => 8);

  const base = Math.floor(adults / rooms);
  let remainder = adults - base * rooms;
  return Array.from({ length: rooms }, (_, i) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    return { adults: base + extra, children: i === 0 ? childAges : [] };
  });
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields we consume)
// ---------------------------------------------------------------------------

interface LiteApiHotelContent {
  id: string;
  name?: string;
  main_photo?: string;
  thumbnail?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number; // guest review score, 0-10
  stars?: number; // star category, 0-5
  review_count?: number | null;
}

interface LiteApiRate {
  boardName?: string;
  boardType?: string;
  cancellationPolicies?: { refundableTag?: string };
}

interface LiteApiRoomType {
  offerRetailRate?: { amount?: number; currency?: string };
  rates?: LiteApiRate[];
}

interface LiteApiRateEntry {
  hotelId: string;
  roomTypes?: LiteApiRoomType[];
}

interface LiteApiRatesResponse {
  hotels?: LiteApiHotelContent[];
  data?: LiteApiRateEntry[];
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Cheapest priced room-type for a hotel, and a few honest amenity chips
 *  derived from the offer (board + refundability). */
function summariseOffer(entry: LiteApiRateEntry): { total: number; amenities: string[] } | null {
  const priced = (entry.roomTypes ?? [])
    .map((rt) => ({ rt, amount: rt.offerRetailRate?.amount ?? 0 }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => a.amount - b.amount);
  if (!priced.length) return null;

  const cheapest = priced[0];
  const rate = cheapest.rt.rates?.[0];
  const amenities: string[] = [];
  const board = `${rate?.boardName ?? ''} ${rate?.boardType ?? ''}`.toLowerCase();
  if (/breakfast|bb|half board|full board|hb|fb/.test(board)) amenities.push('Breakfast included');
  if (rate?.cancellationPolicies?.refundableTag === 'RFN') amenities.push('Free cancellation');

  return { total: cheapest.amount, amenities };
}

function normalise(content: LiteApiHotelContent, entry: LiteApiRateEntry, nights: number): HotelResult | null {
  const offer = summariseOffer(entry);
  if (!offer) return null;

  // LiteAPI guest score is 0-10; the app normalises hotel ratings to 0-5.
  const rating = content.rating ? Math.min(5, Math.round((content.rating / 2) * 10) / 10) : 0;

  return {
    id: `liteapi-${content.id}`,
    name: content.name ?? 'Unknown hotel',
    price_per_night: Math.round(offer.total / nights),
    rating,
    review_count: content.review_count ?? 0,
    amenities: offer.amenities,
    lat: content.latitude ?? 0,
    lng: content.longitude ?? 0,
    image_url: content.main_photo ?? content.thumbnail ?? '',
    source: 'liteapi',
    booking_url: '', // no public deep link — see file header
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeLiteApiHotels(
  destination: string,
  checkin: string,
  checkout: string,
  occupancy: Occupancy = {}
): Promise<HotelResult[]> {
  if (!process.env.LITEAPI_API_KEY) return []; // unconfigured — fail soft

  const center = await geocode(destination);
  if (!center) {
    console.warn(`[liteapi] could not geocode "${destination}"`);
    return [];
  }

  try {
    const res = await axios.post<LiteApiRatesResponse>(
      `${BASE}/hotels/rates`,
      {
        latitude: center.lat,
        longitude: center.lng,
        radius: SEARCH_RADIUS_M,
        checkin,
        checkout,
        occupancies: buildOccupancies(occupancy),
        currency: 'USD',
        guestNationality: 'US',
        maxRatesPerHotel: 1,
      },
      { headers: liteApiHeaders(), timeout: 25_000 }
    );

    const nights = nightsBetween(checkin, checkout);
    const contentById = new Map((res.data.hotels ?? []).map((h) => [h.id, h]));

    const hotels = (res.data.data ?? [])
      .map((entry) => {
        const content = contentById.get(entry.hotelId);
        return content ? normalise(content, entry, nights) : null;
      })
      .filter((h): h is HotelResult => h !== null)
      .slice(0, MAX_HOTELS);

    console.log(`[liteapi] ${destination}: ${hotels.length} hotels`);
    return hotels;
  } catch (err: unknown) {
    console.error('[liteapi] searchRates error:', err instanceof Error ? err.message : err);
    return [];
  }
}
