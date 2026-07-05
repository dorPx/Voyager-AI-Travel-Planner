'use client';

import type { TripItinerary, ItineraryDay } from '../../shared/types';
import { useCurrency } from '@/context/CurrencyContext';
import { transitHint } from '@/components/itinerary/utils';

interface Props {
  itinerary: TripItinerary;
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="text-yellow-400 text-xs">
      {'★'.repeat(Math.min(full, 5))}{'☆'.repeat(Math.max(0, 5 - full))}
      <span className="text-slate-400 ml-1">{rating.toFixed(1)}</span>
    </span>
  );
}

function DayCard({ day }: { day: ItineraryDay }) {
  const { format } = useCurrency();
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-5 py-3 flex items-center justify-between">
        <span className="font-semibold">Day {day.day}</span>
        <span className="text-blue-100 text-sm">{day.date}</span>
        <span className="text-sm font-medium">Est. {format(day.estimated_cost)}</span>
      </div>

      <div className="p-5 space-y-4">
        {day.hotel && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">🏨 Hotel</h4>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-800 text-sm">{day.hotel.name}</p>
                <StarRating rating={day.hotel.rating} />
                <p className="text-slate-500 text-xs mt-0.5">{day.hotel.amenities.slice(0, 3).join(' · ')}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-800 text-sm">{format(day.hotel.price_per_night)}</p>
                <p className="text-xs text-slate-400">/night</p>
                {day.hotel.booking_url && (
                  <a
                    href={day.hotel.booking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Book →
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {day.activities.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">🎯 Activities</h4>
            <ul className="space-y-2">
              {day.activities.map((a, i) => {
                const next = day.activities[i + 1];
                const hint = next ? transitHint(a, next) : null;
                return (
                  <li key={a.id}>
                    <div className="flex items-start gap-2">
                      <span className="bg-green-100 text-green-700 text-xs rounded-full px-2 py-0.5 mt-0.5 flex-shrink-0">{a.category}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{a.name}</p>
                        <p className="text-xs text-slate-400">{a.duration_hours}h · {a.price > 0 ? format(a.price) : 'Free'}</p>
                      </div>
                    </div>
                    {hint && <p className="text-[11px] text-slate-400 pl-2 pt-1">↓ {hint}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {day.meals.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">🍽 Meals</h4>
            <ul className="space-y-1.5">
              {day.meals.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className="text-slate-600 text-sm font-medium">{r.name}</span>
                  <span className="text-slate-400 text-xs">· {r.cuisine}</span>
                  <StarRating rating={r.rating} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ItineraryView({ itinerary }: Props) {
  const { format } = useCurrency();
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-slate-300 text-sm capitalize">{itinerary.trip_type} trip</p>
          <p className="text-2xl font-bold">{itinerary.destination}</p>
        </div>
        <div className="text-right">
          <p className="text-slate-300 text-sm">Total estimated cost</p>
          <p className="text-2xl font-bold text-green-400">{format(itinerary.total_cost)}</p>
        </div>
      </div>

      {itinerary.days.map((day) => (
        <DayCard key={day.day} day={day} />
      ))}
    </div>
  );
}
