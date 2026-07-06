'use client';

import { useState } from 'react';
import type { HotelResult, PricePoint } from '../../../shared/types';
import { AmenityChip } from './shared';
import { useSearch } from '@/context/SearchContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useCurrency } from '@/context/CurrencyContext';
import { sourceLabel } from '@/lib/sourceLabel';
import { TrendBadge, computeTrend } from './PriceTrend';

export interface HotelCardProps extends HotelResult {
  selected: boolean;
  onSelect: () => void;
  onCompare: () => void;
  /** Opens the full details modal for this hotel. */
  onDetails?: () => void;
  /** Prior price, if the live-price poller detected a drop — renders the "Price dropped!" badge. */
  previousPrice?: number;
  /** Cross-session price observations (oldest first) — renders the trend badge. */
  history?: PricePoint[];
  /**
   * Force the vertical (mobile) layout regardless of viewport. Used in map
   * mode, where the list column is narrow but the viewport is wide — Tailwind
   * breakpoints can't see container width, so the horizontal row layout would
   * crush the title to one letter per line.
   */
  stacked?: boolean;
}

// Booking.com's review vocabulary, on our normalized 0-5 scale (score ≈ rating × 2).
function scoreWord(rating: number): string {
  if (rating >= 4.5) return 'Wonderful';
  if (rating >= 4.0) return 'Very good';
  if (rating >= 3.5) return 'Good';
  if (rating >= 3.0) return 'Pleasant';
  return 'Rated';
}

function nightsBetween(checkin?: string, checkout?: string): number {
  if (!checkin || !checkout) return 0;
  const ms = new Date(checkout).getTime() - new Date(checkin).getTime();
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return Math.round(ms / 86400000);
}

export default function HotelCard(props: HotelCardProps) {
  const {
    id,
    name,
    price_per_night,
    rating,
    review_count,
    amenities,
    distance_km,
    image_url,
    source,
    booking_url,
    selected,
    onSelect,
    onCompare,
    onDetails,
    previousPrice,
    history,
    stacked = false,
  } = props;

  const { setHoveredHotelId, lastParams } = useSearch();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { format } = useCurrency();
  const saved = isFavorite(id);
  // Strip the presentational props (callbacks, flags) so only the HotelResult
  // shape is persisted to the favorites store.
  const {
    selected: _s,
    onSelect: _os,
    onCompare: _oc,
    onDetails: _od,
    previousPrice: _pp,
    history: _h,
    stacked: _st,
    ...hotel
  } = props;
  const [imgError, setImgError] = useState(false);
  const showImage = image_url && !imgError;
  const hasPrice = price_per_night > 0;
  const hasRating = rating > 0;
  const priceDropped = hasPrice && typeof previousPrice === 'number' && previousPrice > price_per_night;
  const trend = computeTrend(price_per_night, history);

  // Booking.com prices the whole stay: "$1,432 · 7 nights, 2 adults".
  const nights = nightsBetween(lastParams?.checkin, lastParams?.checkout);
  const adults = lastParams?.adults ?? 2;
  const totalPrice = nights > 0 ? price_per_night * nights : price_per_night;

  function handleViewDeal() {
    if (booking_url) window.open(booking_url, '_blank', 'noopener,noreferrer');
  }

  return (
    <article
      id={`hotel-card-${id}`}
      onMouseEnter={() => setHoveredHotelId(id)}
      onMouseLeave={() => setHoveredHotelId(null)}
      className={`bg-white rounded-xl border border-beige-300 overflow-hidden hover:shadow-lg transition-shadow flex scroll-mt-36 ${
        stacked ? 'flex-col' : 'flex-col sm:flex-row'
      }`}
    >
      {/* Photo */}
      <div className={`relative w-full h-44 shrink-0 ${stacked ? '' : 'sm:h-auto sm:w-52 md:w-60'}`}>
        <button
          type="button"
          onClick={onDetails ?? onSelect}
          aria-label={`View details for ${name}`}
          className="group relative block w-full h-full text-left"
        >
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image_url}
              alt={name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="absolute inset-0 bg-sky-100 flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sky-300" aria-hidden="true">
                <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
              </svg>
            </div>
          )}
          {onDetails && (
            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/30 text-white text-xs font-semibold transition-opacity">
              View details
            </span>
          )}
          <span className="absolute bottom-2 left-2 bg-white/90 text-[10px] font-medium text-brand-dark px-2 py-0.5 rounded-full shadow">
            {sourceLabel(source)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => toggleFavorite(hotel)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
          className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 shadow hover:bg-white transition-colors"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            className={saved ? 'text-rose-500 animate-heart-pop' : 'text-brand-mid'}
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
          </svg>
        </button>
      </div>

      {/* Details: title + review block on the first row, booking.com-style */}
      <div className="flex-1 min-w-0 p-4 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          {booking_url ? (
            <a
              href={booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-bold text-sky-400 hover:text-sky-500 hover:underline leading-snug line-clamp-2 min-w-0"
            >
              {name}
            </a>
          ) : (
            <h3 className="text-base font-bold text-brand-black leading-snug line-clamp-2 min-w-0">{name}</h3>
          )}

          {hasRating && (
            <div className="flex items-start gap-2 shrink-0">
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold text-brand-dark">{scoreWord(rating)}</p>
                {review_count > 0 && (
                  <p className="text-xs text-brand-mid">{review_count.toLocaleString()} reviews</p>
                )}
              </div>
              <span className="inline-flex items-center justify-center bg-sky-400 text-white text-sm font-bold rounded-md rounded-bl-none px-1.5 py-1 min-w-[2.1rem]">
                {rating.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {!hasRating && <span className="text-xs text-brand-mid">No reviews yet</span>}

        {typeof distance_km === 'number' && (
          <span className="text-xs text-brand-mid">
            {distance_km < 1 ? `${Math.round(distance_km * 1000)} m` : `${distance_km.toFixed(1)} km`} from center
          </span>
        )}

        {amenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
            {amenities.slice(0, 4).map((a) => (
              <AmenityChip key={a} label={a} />
            ))}
            {amenities.length > 4 && (
              <span className="text-[11px] text-brand-mid self-center">+{amenities.length - 4} more</span>
            )}
          </div>
        )}
      </div>

      {/* Price + actions rail */}
      <div
        className={`shrink-0 p-4 flex items-center justify-between gap-3 border-beige-200 ${
          stacked
            ? 'border-t'
            : 'sm:w-52 sm:pl-2 sm:flex-col sm:items-end sm:text-right sm:justify-end border-t sm:border-t-0'
        }`}
      >
        <div className={`flex flex-col ${stacked ? '' : 'sm:items-end'}`}>
          {priceDropped && (
            <span className={`animate-price-flash inline-block self-start text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full mb-1 ${stacked ? '' : 'sm:self-end'}`}>
              Price dropped!
            </span>
          )}
          {hasPrice ? (
            <>
              {nights > 0 && (
                <span className="text-xs text-brand-mid">
                  {nights} night{nights === 1 ? '' : 's'}, {adults} adult{adults === 1 ? '' : 's'}
                </span>
              )}
              <div className={`flex items-baseline gap-1.5 ${stacked ? '' : 'sm:justify-end'}`}>
                {priceDropped && nights > 0 && (
                  <span className="text-sm text-brand-mid line-through">{format(previousPrice! * nights)}</span>
                )}
                <span className="text-2xl font-bold text-brand-black">{format(totalPrice)}</span>
              </div>
              <span className="text-xs text-brand-mid">
                {nights > 0 ? `${format(price_per_night)} per night` : 'per night'}
              </span>
              {trend && (
                <span className={`mt-1 self-start ${stacked ? '' : 'sm:self-end'}`}>
                  <TrendBadge trend={trend} />
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-brand-mid italic">Price unavailable</span>
          )}
        </div>

        <div className={`flex gap-2 w-auto ${stacked ? '' : 'sm:flex-col sm:w-full'}`}>
          <button
            type="button"
            onClick={handleViewDeal}
            disabled={!booking_url}
            className="bg-sky-400 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            See availability
          </button>
          <button
            type="button"
            onClick={onCompare}
            aria-pressed={selected}
            className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors whitespace-nowrap ${
              selected
                ? 'bg-brand-black text-white border-brand-black'
                : 'bg-white text-brand-black border-beige-300 hover:border-brand-black'
            }`}
          >
            {selected ? 'Comparing ✓' : 'Compare'}
          </button>
          {onDetails && (
            <button
              type="button"
              onClick={onDetails}
              className={`text-sm font-semibold text-sky-400 hover:text-sky-500 hover:underline px-2 py-2 whitespace-nowrap ${
                stacked ? '' : 'sm:py-1'
              }`}
            >
              View details
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
