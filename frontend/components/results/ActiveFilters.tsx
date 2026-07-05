'use client';

import { useMemo } from 'react';
import { useSearch, DEFAULT_FILTERS, type ReviewScoreBucket } from '@/context/SearchContext';
import { REVIEW_SCORE_BUCKETS } from './filters';
import type { HotelResult } from '../../../shared/types';

const SCORE_LABEL = new Map<ReviewScoreBucket, string>(
  REVIEW_SCORE_BUCKETS.map(({ bucket, label }) => [bucket, label])
);

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

/** Removable chips summarizing every active filter, booking.com-style. */
export default function ActiveFilters({ hotels }: { hotels: HotelResult[] }) {
  const { filters, setFilters } = useSearch();

  const priceBounds = useMemo(() => {
    const prices = hotels.map((h) => h.price_per_night).filter((p) => p > 0);
    if (!prices.length) return { min: 0, max: 2000 };
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [hotels]);

  const chips: Chip[] = [];

  if (filters.priceMin > priceBounds.min || filters.priceMax < priceBounds.max) {
    chips.push({
      key: 'price',
      label: `$${Math.max(filters.priceMin, priceBounds.min).toLocaleString()} – $${Math.min(
        filters.priceMax,
        priceBounds.max
      ).toLocaleString()}/night`,
      onRemove: () => setFilters({ ...filters, priceMin: DEFAULT_FILTERS.priceMin, priceMax: DEFAULT_FILTERS.priceMax }),
    });
  }

  for (const bucket of filters.reviewScores) {
    chips.push({
      key: `score-${bucket}`,
      label: SCORE_LABEL.get(bucket) ?? `Score ${bucket}+`,
      onRemove: () => setFilters({ ...filters, reviewScores: filters.reviewScores.filter((b) => b !== bucket) }),
    });
  }

  for (const amenity of filters.amenities) {
    chips.push({
      key: `amenity-${amenity}`,
      label: amenity,
      onRemove: () => setFilters({ ...filters, amenities: filters.amenities.filter((a) => a !== amenity) }),
    });
  }

  for (const source of filters.sources) {
    chips.push({
      key: `source-${source}`,
      label: source,
      onRemove: () => setFilters({ ...filters, sources: filters.sources.filter((s) => s !== source) }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex items-center gap-1.5 bg-sky-100 text-sky-500 border border-sky-200 rounded-full pl-3 pr-2 py-1 text-xs font-medium hover:bg-sky-200 transition-colors"
        >
          {chip.label}
          <span aria-hidden="true" className="text-sm leading-none">
            ×
          </span>
          <span className="sr-only">Remove filter</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() =>
            setFilters({
              ...DEFAULT_FILTERS,
              priceMin: priceBounds.min,
              priceMax: priceBounds.max,
              sortBy: filters.sortBy,
            })
          }
          className="text-xs font-medium text-brand-mid hover:text-brand-black hover:underline transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
