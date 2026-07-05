'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useSearch } from '@/context/SearchContext';
import type { HotelResult, PricePoint } from '../../../shared/types';
import ResultsTabs, { type ResultsTab } from './ResultsTabs';
import HotelCard from './HotelCard';
import ActivityCard from './ActivityCard';
import FlightCard from './FlightCard';
import RestaurantCard from './RestaurantCard';
import ComparisonTable from './ComparisonTable';
import ToastViewport from './ToastViewport';
import { Spinner } from './shared';
import { usePricePolling } from './usePricePolling';
import { filterHotels, filterByRatingAndSource, countActiveFilters } from './filters';
import ActiveFilters from './ActiveFilters';
import { useFavorites } from '@/context/FavoritesContext';
import { DEFAULT_FILTERS, type SortOption } from '@/context/SearchContext';
import MapToggle from '@/components/map/MapToggle';
import FilterSidebar from './FilterSidebar';
import SearchSummaryBar from './SearchSummaryBar';
import HotelDetailsModal from './HotelDetailsModal';
import WeatherStrip from '@/components/WeatherStrip';
import ErrorBoundary from '@/components/ErrorBoundary';
import { distinctSourceLabels } from '@/lib/sourceLabel';
import { api } from '@/lib/api';

const MAX_COMPARE = 4;

// Leaflet's successor (Google Maps JS) touches `window` — never SSR this.
const TravelMap = dynamic(() => import('@/components/map/TravelMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[400px] flex items-center justify-center bg-sky-100 rounded-xl border border-beige-300">
      <Spinner />
    </div>
  ),
});

function SkeletonRow() {
  return (
    <div className="bg-white border border-beige-300 rounded-xl overflow-hidden flex flex-col sm:flex-row">
      <div className="h-44 sm:h-auto sm:w-60 shrink-0 animate-shimmer" />
      <div className="flex-1 p-4 space-y-3">
        <div className="h-4 w-2/3 rounded animate-shimmer" />
        <div className="h-3 w-1/3 rounded animate-shimmer" />
        <div className="h-3 w-1/2 rounded animate-shimmer" />
      </div>
      <div className="sm:w-48 p-4 space-y-3">
        <div className="h-6 w-20 sm:ml-auto rounded animate-shimmer" />
        <div className="h-8 w-full rounded-lg animate-shimmer" />
        <div className="h-8 w-full rounded-lg animate-shimmer" />
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-3 max-w-4xl mx-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
      <p className="text-center text-sm text-brand-mid mt-6">
        Checking live prices across Booking.com, TripAdvisor &amp; Google…
      </p>
    </div>
  );
}

/** Wraps a card with the staggered fade-in-and-slide-up entrance animation. */
function Staggered({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div className="animate-card-in" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      {children}
    </div>
  );
}

export default function ResultsContainer() {
  return (
    <Suspense fallback={null}>
      <ResultsContainerInner />
    </Suspense>
  );
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'best_value', label: 'Our top picks' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'distance', label: 'Distance from center' },
  { value: 'price_asc', label: 'Price (lowest first)' },
  { value: 'price_desc', label: 'Price (highest first)' },
];

function ResultsContainerInner() {
  const { results, loading, error, banner, lastParams, setResults, filters, setFilters, updateParams, appendHotels } =
    useSearch();
  const { favoriteIds, count: savedCount } = useFavorites();
  const searchParams = useSearchParams();
  const showMap = searchParams.get('map') === '1';

  const [compareList, setCompareList] = useState<HotelResult[]>([]);
  const [priceDrops, setPriceDrops] = useState<Record<string, number>>({});
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [detailsHotel, setDetailsHotel] = useState<HotelResult | null>(null);

  // Cross-session price history, keyed by lowercased hotel name. Fetched
  // fail-soft after results land (and again as "Load more" extends the list).
  const [priceHistory, setPriceHistory] = useState<Record<string, PricePoint[]>>({});
  const hotelCount = results?.hotels.length ?? 0;
  useEffect(() => {
    if (!lastParams?.destination || !hotelCount) {
      setPriceHistory({});
      return;
    }
    let cancelled = false;
    const names = (results?.hotels ?? []).slice(0, 60).map((h) => h.name);
    api.getPriceHistory(lastParams.destination, names).then((history) => {
      if (!cancelled) setPriceHistory(history);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastParams, hotelCount]);

  // "Load more" pagination — page 1 is the main search; more starts at 2.
  const [morePage, setMorePage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreExhausted, setMoreExhausted] = useState(false);

  // A fresh search resets pagination.
  useEffect(() => {
    setMorePage(1);
    setMoreExhausted(false);
  }, [lastParams]);

  const handleLoadMore = useCallback(async () => {
    if (!lastParams || !results || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = morePage + 1;
      const more = await api.loadMoreHotels({ ...lastParams, page: nextPage });
      // Dedupe against everything already shown — by id and (cross-source) by name.
      const ids = new Set(results.hotels.map((h) => h.id));
      const names = new Set(results.hotels.map((h) => h.name.toLowerCase().trim()));
      const fresh = more.filter((h) => !ids.has(h.id) && !names.has(h.name.toLowerCase().trim()));
      if (fresh.length === 0) {
        setMoreExhausted(true);
      } else {
        appendHotels(fresh);
        setMorePage(nextPage);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [lastParams, results, loadingMore, morePage, appendHotels]);

  const toggleCompare = useCallback((hotel: HotelResult) => {
    setCompareList((prev) => {
      const exists = prev.some((h) => h.id === hotel.id);
      if (exists) return prev.filter((h) => h.id !== hotel.id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, hotel];
    });
  }, []);

  const removeFromCompare = useCallback((id: string) => {
    setCompareList((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const clearCompare = useCallback(() => setCompareList([]), []);

  const handlePriceChange = useCallback(
    (updatedHotels: HotelResult[], changes: Array<{ id: string; old_price: number; new_price: number }>) => {
      if (!results) return;
      setResults({ ...results, hotels: updatedHotels });
      setPriceDrops((prev) => {
        const next = { ...prev };
        for (const change of changes) {
          if (change.new_price < change.old_price) next[change.id] = change.old_price;
        }
        return next;
      });
      setCompareList((prev) => prev.map((h) => updatedHotels.find((u) => u.id === h.id) ?? h));
    },
    [results, setResults]
  );

  usePricePolling(lastParams, results?.hotels ?? [], handlePriceChange);

  const filtered = useMemo(() => {
    if (!results) return null;
    return {
      hotels: filterHotels(results.hotels, filters),
      activities: filterByRatingAndSource(results.activities, filters),
      restaurants: filterByRatingAndSource(results.restaurants, filters),
      flights: results.flights,
    };
  }, [results, filters]);

  const activeFilterCount = useMemo(() => {
    const prices = (results?.hotels ?? []).map((h) => h.price_per_night).filter((p) => p > 0);
    const bounds = prices.length
      ? { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
      : { min: 0, max: 2000 };
    return countActiveFilters(filters, bounds);
  }, [results, filters]);

  // Which providers actually contributed to these results (honest attribution).
  const sourceLabels = useMemo(
    () =>
      distinctSourceLabels([
        ...(results?.hotels ?? []),
        ...(results?.activities ?? []),
        ...(results?.restaurants ?? []),
      ]),
    [results]
  );

  const tabs: ResultsTab[] = useMemo(() => {
    if (!filtered) return [];

    // In map mode the list shares the row with the map — tighten grids so
    // cards don't get crushed into slivers.
    const placeGrid = showMap
      ? 'grid grid-cols-1 xl:grid-cols-2 gap-4'
      : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4';

    // "Saved only" is a view toggle layered on top of the sidebar filters.
    const visibleHotels = showSavedOnly ? filtered.hotels.filter((h) => favoriteIds.has(h.id)) : filtered.hotels;
    const filtersActive = activeFilterCount > 0;

    const tabList: ResultsTab[] = [
      {
        id: 'hotels',
        label: 'Hotels',
        count: visibleHotels.length,
        content: (
          <div className="flex flex-col gap-3">
            {visibleHotels.map((h, i) => (
              <Staggered key={h.id} index={i}>
                <HotelCard
                  {...h}
                  selected={compareList.some((c) => c.id === h.id)}
                  onSelect={() => toggleCompare(h)}
                  onCompare={() => toggleCompare(h)}
                  onDetails={() => setDetailsHotel(h)}
                  previousPrice={priceDrops[h.id]}
                  history={priceHistory[h.name.toLowerCase().trim()]}
                  stacked={showMap}
                />
              </Staggered>
            ))}
            {visibleHotels.length === 0 && (
              <div className="py-12 text-center">
                {showSavedOnly ? (
                  <>
                    <p className="text-sm font-medium text-brand-black mb-1">No saved hotels in this search</p>
                    <p className="text-sm text-brand-mid mb-3">Tap the heart on any hotel to save it here.</p>
                    <button
                      type="button"
                      onClick={() => setShowSavedOnly(false)}
                      className="text-sm font-semibold text-sky-400 hover:text-sky-500 hover:underline"
                    >
                      Show all hotels
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-brand-black mb-1">No hotels match your filters</p>
                    <p className="text-sm text-brand-mid mb-3">Try widening your price range or removing a filter.</p>
                    {filtersActive && (
                      <button
                        type="button"
                        onClick={() => setFilters({ ...DEFAULT_FILTERS, sortBy: filters.sortBy })}
                        className="text-sm font-semibold text-sky-400 hover:text-sky-500 hover:underline"
                      >
                        Clear all filters
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            {/* Load more — hotels only; hidden in saved-only view (that's a
                fixed local set) and once Booking's pages are exhausted. */}
            {!showSavedOnly && visibleHotels.length > 0 && (
              <div className="py-3 text-center">
                {moreExhausted ? (
                  <p className="text-sm text-brand-mid">You&apos;ve seen all available hotels for this search.</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="bg-white border border-sky-400 text-sky-500 hover:bg-sky-50 disabled:opacity-60 disabled:cursor-wait text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {loadingMore ? 'Loading more hotels…' : 'Load more hotels'}
                  </button>
                )}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'activities',
        label: 'Activities',
        count: filtered.activities.length,
        content: (
          <div className={placeGrid}>
            {filtered.activities.map((a, i) => (
              <Staggered key={a.id} index={i}>
                <ActivityCard {...a} />
              </Staggered>
            ))}
          </div>
        ),
      },
      {
        id: 'restaurants',
        label: 'Restaurants',
        count: filtered.restaurants.length,
        content: (
          <div className={placeGrid}>
            {filtered.restaurants.map((r, i) => (
              <Staggered key={r.id} index={i}>
                <RestaurantCard {...r} />
              </Staggered>
            ))}
          </div>
        ),
      },
    ];

    // A permanently-empty "Flights (0)" tab reads as broken; flights only
    // exist when the user gave an origin, so only surface the tab then.
    if (filtered.flights.length > 0) {
      tabList.splice(1, 0, {
        id: 'flights',
        label: 'Flights',
        count: filtered.flights.length,
        content: (
          <div className="flex flex-col gap-3">
            {filtered.flights.map((f, i) => (
              <Staggered key={f.id} index={i}>
                <FlightCard {...f} />
              </Staggered>
            ))}
          </div>
        ),
      });
    }

    return tabList;
  }, [filtered, showMap, compareList, priceDrops, priceHistory, toggleCompare, showSavedOnly, favoriteIds, activeFilterCount, filters, setFilters, loadingMore, moreExhausted, handleLoadMore]);

  if (loading) return <SkeletonList />;

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white border border-beige-300 rounded-xl px-4 py-4">
          <p className="text-sm text-red-600 mb-3">{error}</p>
          {lastParams && (
            <button
              type="button"
              onClick={() => updateParams({})}
              disabled={loading}
              className="bg-sky-400 hover:bg-sky-500 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {loading ? 'Retrying…' : 'Try again'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!results || !filtered) return null;

  const totalCount = results.hotels.length + results.flights.length + results.activities.length + results.restaurants.length;

  if (totalCount === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-lg font-medium text-brand-black mb-2">No results found</p>
        <p className="text-sm text-brand-mid">Try a different destination, or widen your dates and budget.</p>
      </div>
    );
  }

  return (
    <div className={`max-w-7xl mx-auto px-4 pt-6 ${compareList.length >= 2 ? 'pb-72' : 'pb-10'}`}>
      <SearchSummaryBar stayCount={filtered.hotels.length} />
      {banner && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">{banner}</div>
      )}

      {/* Results header: what + where on the left, sort + view controls on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-black">
            {lastParams?.destination ?? 'Results'}
            <span className="font-normal text-brand-mid">
              : {filtered.hotels.length} propert{filtered.hotels.length === 1 ? 'y' : 'ies'} found
            </span>
          </h2>
          {sourceLabels.length > 0 && (
            <p className="text-xs text-brand-mid mt-0.5">Comparing across {sourceLabels.join(' · ')}</p>
          )}
          {results.cached && (
            <p className="text-xs text-brand-mid mt-0.5">
              Prices checked {results.cache_age_minutes} minute{results.cache_age_minutes === 1 ? '' : 's'} ago
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSavedOnly((v) => !v)}
              aria-pressed={showSavedOnly}
              className={`flex items-center gap-1.5 border rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                showSavedOnly
                  ? 'bg-rose-500 border-rose-500 text-white'
                  : 'bg-white border-beige-300 text-brand-black hover:border-rose-300'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={showSavedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
              Saved {savedCount}
            </button>
          )}
          <label className="flex items-center gap-1.5 border border-beige-300 bg-white rounded-lg pl-3 pr-2 py-1.5">
            <span className="text-xs font-medium text-brand-mid whitespace-nowrap">Sort by:</span>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as SortOption })}
              className="text-xs font-semibold text-brand-black bg-transparent focus:outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setFilterDrawerOpen(true)}
            className="lg:hidden text-xs font-medium border border-beige-300 bg-white hover:bg-beige-100 text-brand-black px-3 py-1.5 rounded-lg transition-colors"
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center bg-sky-400 text-white text-[10px] font-bold rounded-full min-w-[1.1rem] h-[1.1rem] px-1">
                {activeFilterCount}
              </span>
            )}
          </button>
          <MapToggle />
        </div>
      </div>

      {/* Forecast for the trip window — renders nothing when unforecastable */}
      <div className="mt-2">
        <WeatherStrip destination={lastParams?.destination} start={lastParams?.checkin} end={lastParams?.checkout} />
      </div>

      {/* Removable chips for each applied filter */}
      <ActiveFilters hotels={results.hotels} />

      {/* Filters rail + results column, both in normal document flow */}
      <div className="mt-4 flex items-start gap-6">
        <FilterSidebar open={filterDrawerOpen} onClose={() => setFilterDrawerOpen(false)} />

        <div className="flex-1 min-w-0">
          {showMap ? (
            <div className="flex flex-col xl:flex-row gap-4 items-start">
              <div className="w-full xl:w-[48%] h-[45vh] xl:h-[calc(100vh-160px)] xl:sticky xl:top-20 shrink-0">
                <ErrorBoundary label="TravelMap">
                  {/* Top 20 of the current filter + sort selection — the list is
                      already ordered by the sidebar's sort, so slicing keeps the
                      map focused on the best matches instead of 40+ pins. */}
                  <TravelMap
                    hotels={filtered.hotels.slice(0, 20)}
                    activities={filtered.activities}
                    restaurants={filtered.restaurants}
                  />
                </ErrorBoundary>
              </div>
              <div className="w-full xl:w-[52%] min-w-0">
                <ResultsTabs tabs={tabs} />
              </div>
            </div>
          ) : (
            <ResultsTabs tabs={tabs} />
          )}
        </div>
      </div>

      {compareList.length >= 2 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-beige-300 shadow-2xl">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <ComparisonTable hotels={compareList} onRemove={removeFromCompare} onClear={clearCompare} />
          </div>
        </div>
      )}

      {detailsHotel && (
        <HotelDetailsModal
          hotel={detailsHotel}
          history={priceHistory[detailsHotel.name.toLowerCase().trim()]}
          onClose={() => setDetailsHotel(null)}
        />
      )}

      <ToastViewport />
    </div>
  );
}
