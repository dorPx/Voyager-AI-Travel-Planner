'use client';

import type { HotelResult } from '../../../shared/types';
import { useCurrency } from '@/context/CurrencyContext';

interface ComparisonTableProps {
  hotels: HotelResult[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

function sourceLabel(source: string): string {
  if (/booking/i.test(source)) return 'Booking.com';
  if (/tripadvisor/i.test(source)) return 'TripAdvisor';
  // Check the more specific "-provider" variant before the plain one, since
  // "hotels.com-provider" would otherwise also match a generic /hotels\.com/ test.
  if (/hotels\.com-provider/i.test(source)) return 'Hotels.com Provider';
  if (/hotels\.com/i.test(source)) return 'Hotels.com';
  if (/airbnb/i.test(source)) return 'Airbnb';
  if (/google/i.test(source)) return 'Google';
  return source;
}

function bestValueId(hotels: HotelResult[]): string | null {
  const priced = hotels.filter((h) => h.price_per_night > 0);
  if (!priced.length) return null;
  return priced.reduce((best, h) => (h.rating / h.price_per_night > best.rating / best.price_per_night ? h : best))
    .id;
}

export default function ComparisonTable({ hotels, onRemove, onClear }: ComparisonTableProps) {
  const allAmenities = Array.from(new Set(hotels.flatMap((h) => h.amenities))).sort();
  const bestId = bestValueId(hotels);
  const { format } = useCurrency();

  const colClass = (id: string) => (id === bestId ? 'bg-sky-50' : '');

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-brand-black">Comparing {hotels.length} hotels</p>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-brand-mid hover:text-brand-black transition-colors"
        >
          Clear comparison
        </button>
      </div>

      <div className="max-h-[40vh] overflow-y-auto overflow-x-auto border border-beige-300 rounded-lg">
        <table className="min-w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="text-left text-xs font-medium text-brand-mid px-3 py-2 w-32 bg-white sticky left-0 z-20">
                &nbsp;
              </th>
              {hotels.map((h) => (
                <th key={h.id} className={`px-3 py-2 text-left min-w-[160px] ${colClass(h.id)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-brand-black truncate">{h.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(h.id)}
                      aria-label={`Remove ${h.name} from comparison`}
                      className="text-brand-mid hover:text-red-600 transition-colors flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-beige-200">
              <td className="px-3 py-2 text-xs font-medium text-brand-mid bg-white sticky left-0">Price</td>
              {hotels.map((h) => (
                <td key={h.id} className={`px-3 py-2 font-semibold text-sky-400 ${colClass(h.id)}`}>
                  {format(h.price_per_night)}/night
                </td>
              ))}
            </tr>
            <tr className="border-t border-beige-200">
              <td className="px-3 py-2 text-xs font-medium text-brand-mid bg-white sticky left-0">Rating</td>
              {hotels.map((h) => (
                <td key={h.id} className={`px-3 py-2 ${colClass(h.id)}`}>
                  {h.rating.toFixed(1)} ★ <span className="text-brand-mid">({h.review_count})</span>
                </td>
              ))}
            </tr>
            {allAmenities.map((amenity) => (
              <tr key={amenity} className="border-t border-beige-200">
                <td className="px-3 py-2 text-xs font-medium text-brand-mid bg-white sticky left-0">{amenity}</td>
                {hotels.map((h) => (
                  <td key={h.id} className={`px-3 py-2 ${colClass(h.id)}`}>
                    {h.amenities.includes(amenity) ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-red-400">✕</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-beige-200">
              <td className="px-3 py-2 text-xs font-medium text-brand-mid bg-white sticky left-0">Source</td>
              {hotels.map((h) => (
                <td key={h.id} className={`px-3 py-2 text-xs text-brand-mid ${colClass(h.id)}`}>
                  {sourceLabel(h.source)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-beige-200">
              <td className="px-3 py-2 text-xs font-medium text-brand-mid bg-white sticky left-0">Actions</td>
              {hotels.map((h) => (
                <td key={h.id} className={`px-3 py-2 ${colClass(h.id)}`}>
                  <button
                    type="button"
                    disabled={!h.booking_url}
                    onClick={() => h.booking_url && window.open(h.booking_url, '_blank', 'noopener,noreferrer')}
                    className="bg-sky-300 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                  >
                    View Deal
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
