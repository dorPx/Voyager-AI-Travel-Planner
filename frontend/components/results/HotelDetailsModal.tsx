'use client';

import { useEffect, useRef, useState } from 'react';
import type { HotelResult, HotelDetails, PricePoint } from '../../../shared/types';
import { AmenityChip, Spinner } from './shared';
import { sourceLabel } from '@/lib/sourceLabel';
import { useCurrency } from '@/context/CurrencyContext';
import { useSearch } from '@/context/SearchContext';
import { api } from '@/lib/api';
import { Sparkline, TrendBadge, computeTrend } from './PriceTrend';

// Pre-booking detail view for one hotel. For a LiteAPI hotel it fetches rich
// content (photo gallery, full amenities, room-level rates, description) for
// the active search dates; for any other source it shows the basic card data.

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
  const [details, setDetails] = useState<HotelDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);

  const isLite = hotel.source === 'liteapi' || hotel.id.startsWith('liteapi-');

  // Fetch rich detail for LiteAPI hotels using the active search's dates/occupancy.
  useEffect(() => {
    if (!isLite || !lastParams?.checkin || !lastParams?.checkout) return;
    let cancelled = false;
    setLoadingDetails(true);
    api
      .getHotelDetails({
        hotelId: hotel.id,
        checkin: lastParams.checkin,
        checkout: lastParams.checkout,
        adults: lastParams.adults,
        children: lastParams.children,
        rooms: lastParams.rooms,
      })
      .then((d) => {
        if (!cancelled) {
          setDetails(d);
          setActivePhoto(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLite, hotel.id, lastParams]);

  const photos = details?.photos.length ? details.photos : hotel.image_url ? [hotel.image_url] : [];
  const hasGallery = photos.length > 1;
  const amenities = details?.amenities.length ? details.amenities : hotel.amenities;

  const changePhoto = (dir: 1 | -1) => setActivePhoto((i) => (photos.length ? (i + dir + photos.length) % photos.length : 0));

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (hasGallery && e.key === 'ArrowRight') changePhoto(1);
      if (hasGallery && e.key === 'ArrowLeft') changePhoto(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, hasGallery, photos.length]);

  const nights = (() => {
    if (!lastParams?.checkin || !lastParams?.checkout) return 0;
    const ms = new Date(lastParams.checkout).getTime() - new Date(lastParams.checkin).getTime();
    return Number.isNaN(ms) || ms <= 0 ? 0 : Math.round(ms / 86400000);
  })();

  const hasPrice = hotel.price_per_night > 0;
  const trend = computeTrend(hotel.price_per_night, history);
  const mapsUrl = hotel.lat || hotel.lng ? `https://www.google.com/maps/search/?api=1&query=${hotel.lat},${hotel.lng}` : null;
  const activeSrc = photos[activePhoto];

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
        {/* Photo / gallery */}
        <div className="relative h-64 bg-sky-100">
          {activeSrc && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeSrc}
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

          {hasGallery && (
            <>
              <button
                type="button"
                onClick={() => changePhoto(-1)}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-brand-black shadow"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => changePhoto(1)}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-brand-black shadow"
              >
                ›
              </button>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
                {activePhoto + 1} / {photos.length}
              </span>
            </>
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

        {/* Thumbnail strip */}
        {hasGallery && (
          <div className="flex gap-1.5 overflow-x-auto px-4 pt-3">
            {photos.slice(0, 12).map((p, i) => (
              <button
                key={p + i}
                type="button"
                onClick={() => setActivePhoto(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-12 w-16 shrink-0 rounded-md overflow-hidden border-2 ${i === activePhoto ? 'border-sky-400' : 'border-transparent'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="p-5 space-y-4">
          {/* Title + rating */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-brand-black leading-snug">{hotel.name}</h2>
              {(details?.stars ?? 0) > 0 && (
                <p className="text-xs text-amber-500" aria-label={`${details!.stars} star hotel`}>
                  {'★'.repeat(Math.min(5, Math.round(details!.stars!)))}
                </p>
              )}
            </div>
            {hotel.rating > 0 && (
              <div className="flex items-start gap-2 shrink-0">
                <div className="text-right leading-tight">
                  <p className="text-sm font-semibold text-brand-dark">{scoreWord(hotel.rating)}</p>
                  {(details?.review_count ?? hotel.review_count) > 0 && (
                    <p className="text-xs text-brand-mid">{(details?.review_count ?? hotel.review_count).toLocaleString()} reviews</p>
                  )}
                </div>
                <span className="inline-flex items-center justify-center bg-sky-400 text-white text-sm font-bold rounded-md rounded-bl-none px-1.5 py-1 min-w-[2.1rem]">
                  {hotel.rating.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-mid">
            {details?.address && <span>{details.address}{details.city ? `, ${details.city}` : ''}</span>}
            {typeof hotel.distance_km === 'number' && (
              <span>
                {hotel.distance_km < 1 ? `${Math.round(hotel.distance_km * 1000)} m` : `${hotel.distance_km.toFixed(1)} km`} from center
              </span>
            )}
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-400 hover:text-sky-500 hover:underline">
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
                      <span className="text-sm font-normal text-brand-mid"> for {nights} night{nights === 1 ? '' : 's'}</span>
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

          {/* Rooms & rates (pre-booking) — LiteAPI only */}
          {isLite && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-mid mb-2">
                Rooms &amp; rates{nights > 0 ? ` · your ${nights} night${nights === 1 ? '' : 's'}` : ''}
              </h3>
              {loadingDetails && !details ? (
                <Spinner label="Loading live rates…" />
              ) : details && details.rooms.length > 0 ? (
                <div className="space-y-1.5">
                  {details.rooms.map((room, i) => (
                    <div key={`${room.name}-${i}`} className="flex items-center justify-between gap-3 bg-beige-50 border border-beige-200 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-dark truncate">{room.name}</p>
                        <p className="text-[11px] text-brand-mid">
                          {room.board}
                          {' · '}
                          <span className={room.refundable ? 'text-emerald-600' : 'text-brand-mid'}>
                            {room.refundable ? 'Free cancellation' : 'Non-refundable'}
                          </span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-brand-black">{format(room.price_total)}</p>
                        <p className="text-[11px] text-brand-mid">{format(room.price_per_night)}/night</p>
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-brand-mid pt-1">Live rates for your dates — shown before you book.</p>
                </div>
              ) : (
                <p className="text-xs text-brand-mid">No live rates returned for these dates.</p>
              )}
            </div>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-mid mb-2">
                Amenities{details?.amenities.length ? ` (${details.amenities.length})` : ''}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {amenities.map((a) => (
                  <AmenityChip key={a} label={a} />
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {details?.description && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-mid mb-2">About this hotel</h3>
              <p className="text-sm text-brand-dark leading-relaxed max-h-40 overflow-y-auto">{details.description}</p>
            </div>
          )}

          {/* Check-in / out + important info */}
          {(details?.checkin_time || details?.checkout_time || details?.important_info) && (
            <div className="text-xs text-brand-mid space-y-1">
              {(details.checkin_time || details.checkout_time) && (
                <p>
                  {details.checkin_time && <>Check-in from <span className="font-medium text-brand-dark">{details.checkin_time}</span></>}
                  {details.checkin_time && details.checkout_time && ' · '}
                  {details.checkout_time && <>Check-out by <span className="font-medium text-brand-dark">{details.checkout_time}</span></>}
                </p>
              )}
              {details.important_info && <p className="italic">{details.important_info}</p>}
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
              title={hotel.booking_url ? undefined : 'This source has no direct booking link'}
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
