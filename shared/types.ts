export interface SearchParams {
  destination: string;
  checkin: string;
  checkout: string;
  /** Occupancy — passed through to providers with occupancy-aware pricing (Booking.com, Hotels.com). */
  adults?: number;
  children?: number;
  rooms?: number;
  budget_min?: number;
  budget_max?: number;
  rating_min?: number;
  amenities?: string[];
  trip_type?: string;
  radius_km?: number;
  lat?: number;
  lng?: number;
  /** Flying-from city/airport — flights are only searched when this is present. */
  origin?: string;
}

export interface HotelResult {
  id: string;
  name: string;
  price_per_night: number;
  rating: number;
  review_count: number;
  amenities: string[];
  lat: number;
  lng: number;
  /** Straight-line distance from the searched destination's center, km. Absent when coords are unknown. */
  distance_km?: number;
  image_url: string;
  source: string;
  booking_url: string;
}

export interface ActivityResult {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  duration_hours: number;
  lat: number;
  lng: number;
  description: string;
  source: string;
}

export interface FlightResult {
  id: string;
  airline: string;
  price: number;
  departure: string;
  arrival: string;
  duration_minutes: number;
  stops: number;
  source: string;
  /** Deep link to book/search this itinerary, when the provider offers one. */
  booking_url?: string;
}

export interface RestaurantResult {
  id: string;
  name: string;
  cuisine: string;
  price_level: number;
  rating: number;
  lat: number;
  lng: number;
  source: string;
}

/** One bookable room option shown in the pre-booking hotel detail view. */
export interface HotelRoomOffer {
  name: string;
  /** Board/meal plan, e.g. "Room Only", "Breakfast included". */
  board: string;
  refundable: boolean;
  /** Whole-stay total and derived per-night, both in USD. */
  price_total: number;
  price_per_night: number;
}

/** Rich, pre-booking detail for a single hotel (currently LiteAPI-backed). */
export interface HotelDetails {
  id: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  stars?: number;
  /** Guest review score normalized to the app's 0-5 scale. */
  rating?: number;
  review_count?: number;
  photos: string[];
  amenities: string[];
  checkin_time?: string;
  checkout_time?: string;
  important_info?: string;
  rooms: HotelRoomOffer[];
  source: string;
}

export interface ItineraryDay {
  day: number;
  date: string;
  hotel?: HotelResult;
  activities: ActivityResult[];
  meals: RestaurantResult[];
  estimated_cost: number;
}

export interface TripItinerary {
  id: string;
  name: string;
  destination: string;
  days: ItineraryDay[];
  total_cost: number;
  trip_type: string;
  /** Public read-only share token — safe to expose, grants view access only. */
  share_id?: string;
  /** Recommended outbound flight, when the trip was planned with an origin city. */
  flight?: FlightResult;
}

/** One day of forecast for the trip window (Open-Meteo, metric). */
export interface WeatherDay {
  date: string;
  temp_max_c: number;
  temp_min_c: number;
  /** 0-100, max daily probability. */
  precipitation_probability: number;
  /** WMO weather interpretation code. */
  weather_code: number;
}

/** USD-based exchange rates (frankfurter.app / ECB). Always contains USD: 1. */
export interface CurrencyRates {
  base: 'USD';
  rates: Record<string, number>;
  fetched_at: number;
}

/** One recorded price observation for a hotel (dedup key = lowercased name + destination). */
export interface PricePoint {
  price: number;
  observed_at: number;
}

export interface PackingList {
  categories: { name: string; items: string[] }[];
  /** "ai" when OpenRouter produced it, "fallback" for the deterministic list. */
  generated_by: 'ai' | 'fallback';
}

export interface TripSummary {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  trip_type: string;
  created_at: string;
}
