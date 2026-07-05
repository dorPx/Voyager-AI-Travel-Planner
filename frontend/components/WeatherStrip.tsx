'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { WeatherDay } from '../../shared/types';

// Trip-window forecast chips (Open-Meteo via the backend). Renders nothing at
// all when the range is unforecastable or the fetch fails — weather is
// supplementary, never a layout dependency.

/** WMO weather interpretation codes → a coarse emoji + label. */
export function weatherGlyph(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: 'Clear' };
  if (code <= 2) return { icon: '🌤️', label: 'Mostly clear' };
  if (code === 3) return { icon: '☁️', label: 'Overcast' };
  if (code <= 48) return { icon: '🌫️', label: 'Fog' };
  if (code <= 57) return { icon: '🌦️', label: 'Drizzle' };
  if (code <= 67) return { icon: '🌧️', label: 'Rain' };
  if (code <= 77) return { icon: '🌨️', label: 'Snow' };
  if (code <= 82) return { icon: '🌧️', label: 'Showers' };
  if (code <= 86) return { icon: '🌨️', label: 'Snow showers' };
  return { icon: '⛈️', label: 'Thunderstorm' };
}

function dayName(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' });
}

export function useWeather(destination?: string, start?: string, end?: string): WeatherDay[] {
  const [days, setDays] = useState<WeatherDay[]>([]);

  useEffect(() => {
    if (!destination || !start || !end) {
      setDays([]);
      return;
    }
    let cancelled = false;
    api.getWeather(destination, start, end).then((data) => {
      if (!cancelled) setDays(data);
    });
    return () => {
      cancelled = true;
    };
  }, [destination, start, end]);

  return days;
}

export default function WeatherStrip({
  destination,
  start,
  end,
}: {
  destination?: string;
  start?: string;
  end?: string;
}) {
  const days = useWeather(destination, start, end);
  if (!days.length) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1" aria-label="Weather forecast for your dates">
      {days.map((d) => {
        const { icon, label } = weatherGlyph(d.weather_code);
        return (
          <div
            key={d.date}
            title={`${d.date}: ${label}, ${d.temp_min_c}–${d.temp_max_c}°C, ${d.precipitation_probability}% rain chance`}
            className="flex items-center gap-1.5 shrink-0 bg-white border border-beige-300 rounded-lg px-2.5 py-1.5"
          >
            <span aria-hidden="true">{icon}</span>
            <div className="leading-tight">
              <p className="text-[10px] font-medium text-brand-mid">{dayName(d.date)}</p>
              <p className="text-xs font-semibold text-brand-black">
                {d.temp_max_c}°<span className="font-normal text-brand-mid"> / {d.temp_min_c}°</span>
              </p>
            </div>
            {d.precipitation_probability >= 40 && (
              <span className="text-[10px] font-medium text-sky-400">{d.precipitation_probability}%</span>
            )}
          </div>
        );
      })}
      <span className="text-[10px] text-brand-mid shrink-0 pl-1">Open-Meteo</span>
    </div>
  );
}
