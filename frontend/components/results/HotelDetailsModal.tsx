'use client';

import { useEffect, useRef, useState } from 'react';
import type { HotelResult, PricePoint } from '../../../shared/types';
import { AmenityChip } from './shared';
import { sourceLabel } from '@/lib/sourceLabel';
import { useCurrency } from '@/context/CurrencyContext';
import { useSearch } from '@/context/SearchContext';
import { Sparkline, TrendBadge, computeTrend } from './PriceTrend';

// Full-detail view for one hotel, built entirely from already-fetched result
// data — no extra provider call. Opens from the "Details" action on a card.

interface HotelDetailsModalProps {
  hotel: HotelResult;
  history?: PricePoint[];
  onClose: () => void;
}

function scoreWord(rating: number): string {
  if (rating >= 4.5) return 'Wonderful';
  if (rating >= 4.0) return 'Very good';
  if (rating >= 3.5) return 'Good';
  if (rating >= 3.0) return 'Pleasant';
  return 'Rated';
}

export default function HotelDetailsModal({ hotel, history, onClose }: HotelDetailsModalProps) {
  const { format } = useCurrency();
  const { lastParams } = useSearch();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nights = (() => {
    if (!lastParams?.checkin || !lastParams?.checkout) return 0;
    const ms = new Date(lastParams.checkout).getTime() - new Date(lastParams.checkin).getTime();
    return Number.isNaN(ms) || ms <= 0 ? 0 : Math.round(ms / 86400000);
  })();

  const hasPrice = hotel.price_per_night > 0;
  const trend = computeTrend(hotel.price_per_night, history);
  const mapsUrl =
    hotel.lat || hotel.lng ? `https://www.google.com/maps/search/?api=1&query=${hotel.lat},${hotel.lng}` : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${hotel.name}`}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Photo */}
        <div className="relative h-56 bg-sky-100">
          {hotel.image_url && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hotel.image_url}
              alt={hotel.name}
              className="absolute inset-0 w-full h-full object-cover rounded-t-xl"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sky-300" aria-hidden="true">
                <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
              </svg>
            </div>
          )}
          <span className="absolute bottom-3 left-3 bg-white/90 text-[11px] font-medium text-brand-dark px-2 py-1 rounded-full shadow">
            {sourceLabel(hotel.source)}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 shadow hover:bg-white text-brand-black transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title + rating */}
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-brand-black leading-snug">{hotel.name}</h2>
            {hotel.rating > 0 && (
              <div className="flex items-start gap-2 shrink-0">
                <div className="text-right leading-tight">
                  <p className="text-sm font-semibold text-brand-dark">{scoreWord(hotel.rating)}</p>
                  {hotel.review_count > 0 && (
                    <p className="text-xs text-brand-mid">{hotel.review_count.toLocaleString()} reviews</p>
                  )}
                </div>
                <span className="inline-flex items-center justify-center bg-sky-400 text-white text-sm font-bold rounded-md rounded-bl-none px-1.5 py-1 min-w-[2.1rem]">
                  {hotel.rating.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Location line */}
          <div className="flex items-center gap-3 text-xs text-brand-mid">
            {typeof hotel.distance_km === 'number' && (
              <span>
                {hotel.distance_km < 1
                  ? `${Math.round(hotel.distance_km * 1000)} m`
                  : `${hotel.distance_km.toFixed(1)} km`}{' '}
                from center
              </span>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sky-400 hover:text-sky-500 hover:underline"
              >
                Open in Google Maps ↗
              </a>
            )}
          </div>

          {/* Price + trend */}
          <div className="bg-beige-100 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              {hasPrice ? (
                <>
                  <p className="text-2xl font-bold text-brand-black">
                    {format(nights > 0 ? hotel.price_per_night * nights : hotel.price_per_night)}
                    {nights > 0 && (
                      <span className="text-sm font-normal text-brand-mid">
                        {' '}
                        for {nights} night{nights === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-brand-mid">{format(hotel.price_per_night)} per night</p>
                </>
              ) : (
                <p className="text-sm text-brand-mid italic">Price unavailable</p>
              )}
              {trend && (
                <div className="mt-1.5">
                  <TrendBadge trend={trend} />
                </div>
              )}
            </div>
            {history && history.length > 0 && hasPrice && (
              <div className="text-right">
                <Sparkline points={history} currentPrice={hotel.price_per_night} />
                <p className="text-[10px] text-brand-mid mt-0.5">price history</p>
              </div>
            )}
          </div>

          {/* Amenities — the full list, not the card's top 4 */}
          {hotel.amenities.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-mid mb-2">Amenities</h3>
              <div className="flex flex-wrap gap-1.5">
                {hotel.amenities.map((a) => (
                  <AmenityChip key={a} label={a} />
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-brand-black border border-beige-300 hover:bg-beige-100 px-4 py-2 rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!hotel.booking_url}
              onClick={() => hotel.booking_url && window.open(hotel.booking_url, '_blank', 'noopener,noreferrer')}
              className="bg-sky-400 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              See availability
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
