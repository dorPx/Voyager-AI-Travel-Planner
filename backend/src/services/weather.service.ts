import axios from 'axios';
import { cache } from '../db';
import { geocode } from '../scrapers/geocode';
import type { WeatherDay } from '../../../shared/types';

// Open-Meteo daily forecast — keyless and free, so it can never be the source
// that forces an API key on a fresh install. Forecasts reach ~16 days out;
// dates beyond that simply drop out of the response (honest data: no invented
// weather for a trip next spring).

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const FORECAST_HORIZON_DAYS = 16;
const WEATHER_CACHE_TTL_SECONDS = 3 * 60 * 60;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Daily forecast for a destination between two dates (inclusive). Returns []
 * whenever the range is unforecastable, the destination can't be geocoded, or
 * Open-Meteo errors — callers render nothing rather than failing.
 */
export async function getWeather(destination: string, start: string, end: string): Promise<WeatherDay[]> {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return [];

  // Clamp the window to what the forecast can actually cover.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + FORECAST_HORIZON_DAYS * 86400000);
  const from = startDate < today ? today : startDate;
  const to = endDate > horizon ? horizon : endDate;
  if (to < from) return [];

  const cacheKey = `weather:${destination.toLowerCase()}:${isoDate(from)}:${isoDate(to)}`;
  const cached = cache.get<WeatherDay[]>(cacheKey);
  if (cached) return cached;

  const center = await geocode(destination);
  if (!center) return [];

  try {
    const res = await axios.get<{
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: (number | null)[];
        weather_code?: number[];
      };
    }>(FORECAST_URL, {
      params: {
        latitude: center.lat,
        longitude: center.lng,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
        start_date: isoDate(from),
        end_date: isoDate(to),
        timezone: 'auto',
      },
      timeout: 8_000,
    });

    const daily = res.data.daily;
    const dates = daily?.time ?? [];
    const days: WeatherDay[] = dates.map((date, i) => ({
      date,
      temp_max_c: Math.round(daily?.temperature_2m_max?.[i] ?? 0),
      temp_min_c: Math.round(daily?.temperature_2m_min?.[i] ?? 0),
      precipitation_probability: daily?.precipitation_probability_max?.[i] ?? 0,
      weather_code: daily?.weather_code?.[i] ?? 0,
    }));

    if (days.length) cache.set(cacheKey, days, WEATHER_CACHE_TTL_SECONDS);
    return days;
  } catch (err: unknown) {
    console.error('[weather] forecast failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
