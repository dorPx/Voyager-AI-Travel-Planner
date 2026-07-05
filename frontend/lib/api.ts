import {
  SearchParams,
  HotelResult,
  FlightResult,
  ActivityResult,
  RestaurantResult,
  TripItinerary,
  TripSummary,
  CurrencyRates,
  WeatherDay,
  PricePoint,
  PackingList,
} from '../../shared/types';
import type { ModelOption } from '../context/ModelContext';
import type { SearchResults } from '../context/SearchContext';
import { showToast } from '@/components/results/toast';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Preserves the HTTP status (0 = network failure, never reached the server) so callers can branch on it. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// 429/network failures get a uniform toast no matter which endpoint hit them.
// 503 is intentionally NOT toasted here — it needs cache-age context only the
// search call site has, so that's handled by SearchContext.runSearch instead.
function handleStatus(status: number, message: string) {
  if (status === 429) {
    showToast('Rate limit hit — results are cached, try again in 60 seconds');
  } else if (status === 0) {
    showToast('Check your connection');
  }
  return new ApiError(message, status);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw handleStatus(0, 'Network error — check your connection.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw handleStatus(res.status, (err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  } catch {
    throw handleStatus(0, 'Network error — check your connection.');
  }
  if (!res.ok) throw handleStatus(res.status, res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  // Full orchestrated search — POST /api/search
  search: (params: SearchParams) => post<SearchResults>('/api/search', params),

  // Next page of Booking.com hotels for "Load more" — fail-soft: any error
  // reads as "no more results" so the button never breaks the page.
  loadMoreHotels: async (params: SearchParams & { page: number }): Promise<HotelResult[]> => {
    try {
      const data = await post<{ hotels: HotelResult[] }>('/api/search/more', params);
      return Array.isArray(data.hotels) ? data.hotels : [];
    } catch {
      return [];
    }
  },

  // Lightweight destination autocomplete — GET /api/search?q=
  autocomplete: async (query: string): Promise<string[]> => {
    if (!query.trim()) return [];
    try {
      const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data)) return data as string[];
      if (Array.isArray(data?.suggestions)) return data.suggestions as string[];
      return [];
    } catch {
      return [];
    }
  },

  getModels: () => get<ModelOption[]>('/api/models'),

  randomTrip: (payload: { budget: number; dates: { start: string; end: string }; model: string }) =>
    post<{ destination: string; trip_type: string; rationale: string; stream_url: string }>(
      '/api/recommend/random-trip',
      payload
    ),

  searchActivities: (params: SearchParams) =>
    post<{ data: ActivityResult[]; cached: boolean }>('/api/search/activities', params),

  searchRestaurants: (params: SearchParams) =>
    post<{ data: RestaurantResult[]; cached: boolean }>('/api/search/restaurants', params),

  planTrip: (payload: {
    params: SearchParams;
    name: string;
    budget_usd: number;
    hotels?: HotelResult[];
    flights?: FlightResult[];
    activities?: ActivityResult[];
    restaurants?: RestaurantResult[];
  }) => post<TripItinerary>('/api/ai/plan', payload),

  chat: (messages: { role: string; content: string }[], context?: string) =>
    post<{ message: string }>('/api/ai/chat', { messages, context }),

  getTrips: () => get<Omit<TripItinerary, 'days'>[]>('/api/trips'),

  getTrip: (id: string) => get<TripItinerary>(`/api/trips/${id}`),

  deleteTrip: (id: string) =>
    fetch(`${BASE}/api/trips/${id}`, { method: 'DELETE' }).then((r) => r.json()),

  itinerary: {
    list: () => get<TripSummary[]>('/api/itinerary'),
    save: (trip: Omit<TripItinerary, 'id'>) => post<TripItinerary>('/api/itinerary', trip),
    get: (id: string) => get<TripItinerary>(`/api/itinerary/${id}`),
    getShared: (shareId: string) => get<TripItinerary>(`/api/itinerary/shared/${shareId}`),
    exportJsonUrl: (id: string) => `${BASE}/api/itinerary/${id}/export?format=json`,
    exportPdfUrl: (id: string) => `${BASE}/api/itinerary/${id}/export?format=pdf`,
    exportIcsUrl: (id: string) => `${BASE}/api/itinerary/${id}/export?format=ics`,
  },

  // Display-only USD exchange rates — fail-soft to USD-only so a rates outage
  // can never break price rendering.
  getCurrencyRates: async (): Promise<CurrencyRates> => {
    try {
      return await get<CurrencyRates>('/api/currency/rates');
    } catch {
      return { base: 'USD', rates: { USD: 1 }, fetched_at: Date.now() };
    }
  },

  // Trip-window forecast — [] on any failure; callers render nothing.
  getWeather: async (destination: string, start: string, end: string): Promise<WeatherDay[]> => {
    try {
      const data = await get<{ days: WeatherDay[] }>(
        `/api/weather?destination=${encodeURIComponent(destination)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      );
      return Array.isArray(data.days) ? data.days : [];
    } catch {
      return [];
    }
  },

  // Cross-session price observations, keyed by lowercased hotel name.
  getPriceHistory: async (destination: string, names: string[]): Promise<Record<string, PricePoint[]>> => {
    try {
      const data = await post<{ history: Record<string, PricePoint[]> }>('/api/price-history', {
        destination,
        names,
      });
      return data.history ?? {};
    } catch {
      return {};
    }
  },

  packingList: (payload: {
    destination: string;
    start_date?: string;
    end_date?: string;
    trip_type?: string;
    activities?: string[];
  }) => post<PackingList>('/api/ai/packing-list', payload),

  /**
   * Consumes the recommend/stream SSE endpoint. Native EventSource can't be used
   * since the endpoint is POST with a JSON body, so this manually reads the
   * fetch ReadableStream and line-buffers `data: ...\n\n` frames. Returns an
   * abort() function — callers must invoke it on unmount / "Clear" so the
   * background fetch doesn't keep writing into unmounted state.
   */
  streamRecommend(
    body: { destination: string; budget: number; dates: { start: string; end: string }; model: string; trip_type?: string },
    callbacks: { onChunk: (text: string) => void; onDone: () => void; onError: (message: string) => void }
  ): () => void {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${BASE}/api/recommend/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          callbacks.onError((err as { error?: string }).error ?? res.statusText);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();

            if (payload === '[DONE]') {
              callbacks.onDone();
              return;
            }

            try {
              const json = JSON.parse(payload) as { chunk?: string; error?: string };
              if (json.error) {
                callbacks.onError(json.error);
                return;
              }
              if (json.chunk) callbacks.onChunk(json.chunk);
            } catch {
              // ignore malformed SSE fragment
            }
          }
        }

        // Stream ended without an explicit [DONE] frame — treat as completion.
        callbacks.onDone();
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        callbacks.onError(err instanceof Error ? err.message : 'Stream failed.');
      }
    })();

    return () => controller.abort();
  },
};
