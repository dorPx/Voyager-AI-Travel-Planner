'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSearch } from '@/context/SearchContext';
import { useModel } from '@/context/ModelContext';
import { useRecentSearches, type RecentSearch } from '@/lib/recentSearches';
import type { SearchParams } from '../../shared/types';

// Core search params <-> URL query string, so a search survives reload and can
// be shared/bookmarked. Occupancy is included only when non-default to keep
// shared URLs tidy.
function writeSearchToUrl(p: SearchParams) {
  const url = new URL(window.location.href);
  const q = url.searchParams;
  q.set('destination', p.destination);
  q.set('checkin', p.checkin);
  q.set('checkout', p.checkout);
  const setOrDelete = (key: string, val: number | undefined, def: number) =>
    val && val !== def ? q.set(key, String(val)) : q.delete(key);
  setOrDelete('adults', p.adults, 2);
  setOrDelete('children', p.children, 0);
  setOrDelete('rooms', p.rooms, 1);
  window.history.replaceState(null, '', `${url.pathname}?${q.toString()}`);
}

function readSearchFromUrl(): SearchParams | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const destination = q.get('destination');
  const checkin = q.get('checkin');
  const checkout = q.get('checkout');
  if (!destination || !checkin || !checkout) return null;
  const num = (key: string, def: number) => {
    const n = Number(q.get(key));
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return { destination, checkin, checkout, adults: num('adults', 2), children: num('children', 0), rooms: num('rooms', 1) };
}

const AMENITIES = ['WiFi', 'Pool', 'Gym', 'Breakfast', 'Parking', 'Pet-friendly'];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

// --- Inline icons (stroke style matches results/shared.tsx) -----------------

function BedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18v2M21 18v2M3 15h18" />
      <path d="M7 10V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// --- Occupancy stepper -------------------------------------------------------

function Stepper({
  label,
  sublabel,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: number;
  min: number;
  max: number;
  onChange: (update: (current: number) => number) => void;
}) {
  const step = (delta: number) => onChange((current) => Math.min(max, Math.max(min, current + delta)));
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-sm font-medium text-brand-black">{label}</p>
        {sublabel && <p className="text-xs text-brand-mid">{sublabel}</p>}
      </div>
      <div className="flex items-center border border-beige-300 rounded-lg">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="w-9 h-9 text-xl leading-none text-sky-400 disabled:text-beige-300 disabled:cursor-not-allowed hover:enabled:bg-beige-100 rounded-l-lg transition-colors"
        >
          −
        </button>
        <span className="w-8 text-center text-sm font-semibold text-brand-black tabular-nums" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="w-9 h-9 text-xl leading-none text-sky-400 disabled:text-beige-300 disabled:cursor-not-allowed hover:enabled:bg-beige-100 rounded-r-lg transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function SearchBar() {
  const { setResults, setLoading, setError, loading, setLastParams } = useSearch();
  const { selectedModel } = useModel();
  const { recent, record } = useRecentSearches();

  const [destination, setDestination] = useState('');
  const [origin, setOrigin] = useState('');
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [tripType, setTripType] = useState<string | undefined>(undefined);

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [occupancyOpen, setOccupancyOpen] = useState(false);
  const occupancyRef = useRef<HTMLDivElement | null>(null);

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [ratingMin, setRatingMin] = useState<number | undefined>(undefined);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [duration, setDuration] = useState(7);

  const [surprising, setSurprising] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Destination autocomplete (300ms debounce) -------------------------
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!destination.trim()) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      api.autocomplete(destination).then((list) => setSuggestions(list));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [destination]);

  // --- Occupancy popover: close on outside click / Escape -----------------
  useEffect(() => {
    if (!occupancyOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (occupancyRef.current && !occupancyRef.current.contains(e.target as Node)) {
        setOccupancyOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOccupancyOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [occupancyOpen]);

  // --- Date <-> duration two-way sync -------------------------------------
  function handleCheckinChange(value: string) {
    setCheckin(value);
    if (value) setCheckout(addDays(value, duration));
  }

  function handleCheckoutChange(value: string) {
    setCheckout(value);
    if (checkin && value) setDuration(diffDays(checkin, value));
  }

  function handleDurationChange(value: number) {
    setDuration(value);
    if (checkin) setCheckout(addDays(checkin, value));
  }

  function toggleAmenity(a: string) {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  // --- Search ---------------------------------------------------------------

  async function runSearch(params: SearchParams) {
    if (!params.destination || !params.checkin || !params.checkout) {
      setError('Please enter a destination and both check-in / check-out dates.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const data = await api.search(params);
      setResults(data);
      setLastParams(params);
      // Persist to URL + recent list + title only once we know the search ran.
      writeSearchToUrl(params);
      record(params);
      document.title = `${params.destination} — Voyager`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  // Rehydrate a shared/bookmarked/reloaded search from the URL, exactly once.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const fromUrl = readSearchFromUrl();
    if (!fromUrl) return;
    setDestination(fromUrl.destination);
    setCheckin(fromUrl.checkin);
    setCheckout(fromUrl.checkout);
    if (fromUrl.adults) setAdults(fromUrl.adults);
    if (fromUrl.children) setChildren(fromUrl.children);
    if (fromUrl.rooms) setRooms(fromUrl.rooms);
    runSearch(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyRecent(r: RecentSearch) {
    setDestination(r.destination);
    setCheckin(r.checkin);
    setCheckout(r.checkout);
    setAdults(r.adults ?? 2);
    setChildren(r.children ?? 0);
    setRooms(r.rooms ?? 1);
    runSearch({
      destination: r.destination,
      checkin: r.checkin,
      checkout: r.checkout,
      adults: r.adults ?? 2,
      children: r.children ?? 0,
      rooms: r.rooms ?? 1,
    });
  }

  function buildParams(overrideDestination?: string, overrideTripType?: string): SearchParams {
    return {
      destination: overrideDestination ?? destination,
      origin: origin.trim() || undefined,
      checkin,
      checkout,
      adults,
      children,
      rooms,
      budget_min: budgetMin ? Number(budgetMin) : undefined,
      budget_max: budgetMax ? Number(budgetMax) : undefined,
      rating_min: ratingMin,
      amenities: amenities.length ? amenities : undefined,
      trip_type: overrideTripType ?? tripType,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowSuggestions(false);
    setOccupancyOpen(false);
    runSearch(buildParams());
  }

  async function handleSurpriseMe() {
    setSurprising(true);
    setError('');

    const fallbackCheckin = checkin || addDays(new Date().toISOString().slice(0, 10), 30);
    const fallbackCheckout = checkout || addDays(fallbackCheckin, duration);
    const budget = budgetMax ? Number(budgetMax) : 2000;

    try {
      const random = await api.randomTrip({
        budget,
        dates: { start: fallbackCheckin, end: fallbackCheckout },
        model: selectedModel,
      });

      setDestination(random.destination);
      setTripType(random.trip_type);
      if (!checkin) setCheckin(fallbackCheckin);
      if (!checkout) setCheckout(fallbackCheckout);

      await runSearch(buildParams(random.destination, random.trip_type));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not generate a surprise trip.');
    } finally {
      setSurprising(false);
    }
  }

  const occupancySummary = `${adults} adult${adults === 1 ? '' : 's'} · ${children} child${children === 1 ? '' : 'ren'} · ${rooms} room${rooms === 1 ? '' : 's'}`;

  // Booking.com's segment construction: a saturated frame with white fields
  // showing the frame color through 4px gaps. Frame = brand navy, not yellow.
  const segmentClass =
    'flex items-center gap-2 bg-white rounded-lg h-14 px-3 focus-within:ring-2 focus-within:ring-inset focus-within:ring-sky-300';
  const panelInputClass =
    'w-full bg-white border border-beige-300 rounded-lg px-3 py-2.5 text-sm text-brand-black placeholder:text-brand-mid focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300';

  return (
    <div className="w-full max-w-5xl mx-auto">
    <form onSubmit={handleSubmit} className="text-left">
      {/* Primary segmented bar */}
      <div className="bg-sky-500 rounded-xl p-1 shadow-lg flex flex-col md:flex-row gap-1">
        {/* Destination */}
        <div className="relative md:flex-[2.2] min-w-0">
          <div className={segmentClass}>
            <span className="text-brand-mid shrink-0">
              <BedIcon />
            </span>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Where are you going?"
              title={destination || undefined}
              aria-label="Destination"
              className="w-full h-full bg-transparent text-sm font-medium text-brand-black placeholder:text-brand-mid focus:outline-none"
              required
            />
            {destination && (
              <button
                type="button"
                onClick={() => setDestination('')}
                aria-label="Clear destination"
                className="text-brand-mid hover:text-brand-black text-base leading-none shrink-0 w-6 h-6 flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1.5 w-full min-w-[280px] bg-white border border-beige-300 rounded-lg shadow-xl max-h-72 overflow-y-auto py-1">
              {suggestions.map((s) => {
                const commaAt = s.indexOf(',');
                const primary = commaAt === -1 ? s : s.slice(0, commaAt);
                const secondary = commaAt === -1 ? '' : s.slice(commaAt + 1).trim();
                return (
                  <li key={s}>
                    <button
                      type="button"
                      onMouseDown={() => {
                        setDestination(s);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-beige-100 transition-colors flex items-start gap-2.5"
                    >
                      <span className="text-brand-mid mt-0.5 shrink-0">
                        <PinIcon />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-brand-black truncate">{primary}</span>
                        {secondary && <span className="block text-xs text-brand-mid truncate">{secondary}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Dates */}
        <div className={`${segmentClass} md:flex-[1.9]`}>
          <span className="text-brand-mid shrink-0">
            <CalendarIcon />
          </span>
          <input
            type="date"
            value={checkin}
            onChange={(e) => handleCheckinChange(e.target.value)}
            aria-label="Check-in date"
            className="w-full bg-transparent text-sm font-medium text-brand-black focus:outline-none"
            required
          />
          <span className="text-brand-mid shrink-0" aria-hidden="true">
            —
          </span>
          <input
            type="date"
            value={checkout}
            onChange={(e) => handleCheckoutChange(e.target.value)}
            aria-label="Check-out date"
            min={checkin || undefined}
            className="w-full bg-transparent text-sm font-medium text-brand-black focus:outline-none"
            required
          />
        </div>

        {/* Occupancy */}
        <div className="relative md:flex-[1.7]" ref={occupancyRef}>
          <button
            type="button"
            onClick={() => setOccupancyOpen((v) => !v)}
            aria-expanded={occupancyOpen}
            aria-haspopup="dialog"
            className={`${segmentClass} w-full text-left hover:bg-beige-50 transition-colors`}
          >
            <span className="text-brand-mid shrink-0">
              <PersonIcon />
            </span>
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-brand-black">{occupancySummary}</span>
            <span className={`text-brand-mid shrink-0 transition-transform ${occupancyOpen ? 'rotate-180' : ''}`}>
              <ChevronDownIcon />
            </span>
          </button>
          {occupancyOpen && (
            <div
              role="dialog"
              aria-label="Guests and rooms"
              className="absolute z-20 mt-1.5 right-0 w-72 bg-white border border-beige-300 rounded-lg shadow-xl px-4 py-2"
            >
              <Stepper label="Adults" value={adults} min={1} max={16} onChange={setAdults} />
              <Stepper label="Children" sublabel="Ages 0 – 17" value={children} min={0} max={10} onChange={setChildren} />
              <Stepper label="Rooms" value={rooms} min={1} max={8} onChange={setRooms} />
              <button
                type="button"
                onClick={() => setOccupancyOpen(false)}
                className="w-full my-2 border border-sky-400 text-sky-400 hover:bg-sky-50 text-sm font-semibold py-2 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <button
          type="submit"
          disabled={loading}
          className="bg-sky-300 hover:bg-sky-400 disabled:opacity-60 text-white text-lg font-bold rounded-lg h-14 px-8 transition-colors whitespace-nowrap"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Secondary row: options toggle + surprise me */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowMoreFilters((v) => !v)}
          aria-expanded={showMoreFilters}
          className="text-sm font-medium text-sky-500 hover:text-sky-400 hover:underline transition-colors"
        >
          {showMoreFilters ? 'Hide options ▲' : 'More options: flights, budget & amenities ▼'}
        </button>
        <button
          type="button"
          onClick={handleSurpriseMe}
          disabled={surprising}
          className="border border-brand-black bg-white/60 text-brand-black hover:bg-white disabled:opacity-50 font-semibold text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {surprising ? 'Picking…' : 'Surprise me'}
        </button>
      </div>

      {showMoreFilters && (
        <div className="mt-3 bg-white rounded-xl border border-beige-300 p-5 grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Flying from — optional; flights are only searched when this is set */}
          <div>
            <label className="block text-xs font-medium text-brand-mid mb-2">Flying from (optional)</label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. New York"
              className={panelInputClass}
            />
            <p className="text-xs text-brand-mid mt-1">Adds a Flights tab to your results</p>
          </div>

          {/* Budget */}
          <div>
            <label className="block text-xs font-medium text-brand-mid mb-2">Budget per night</label>
            <div className="flex gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-mid text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  placeholder="0"
                  aria-label="Minimum budget"
                  className={`${panelInputClass} pl-6`}
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-mid text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  placeholder="5000"
                  aria-label="Maximum budget"
                  className={`${panelInputClass} pl-6`}
                />
              </div>
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-xs font-medium text-brand-mid mb-2">Minimum rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingMin((prev) => (prev === star ? undefined : star))}
                  className={`text-2xl leading-none transition-colors ${
                    ratingMin && star <= ratingMin ? 'text-sky-300' : 'text-beige-300'
                  }`}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* Amenities */}
          <div>
            <label className="block text-xs font-medium text-brand-mid mb-2">Amenities</label>
            <div className="grid grid-cols-2 gap-2">
              {AMENITIES.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm text-brand-dark cursor-pointer">
                  <input
                    type="checkbox"
                    checked={amenities.includes(a)}
                    onChange={() => toggleAmenity(a)}
                    className="accent-sky-300 w-4 h-4"
                  />
                  {a}
                </label>
              ))}
            </div>
          </div>

          {/* Trip duration */}
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-brand-mid mb-2">
              Trip duration: {duration} night{duration === 1 ? '' : 's'}
            </label>
            <input
              type="range"
              min={1}
              max={30}
              value={duration}
              onChange={(e) => handleDurationChange(Number(e.target.value))}
              className="w-full max-w-md accent-sky-300"
            />
          </div>
        </div>
      )}
    </form>

      {recent.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-brand-dark/70">Recent:</span>
          {recent.map((r) => (
            <button
              key={`${r.destination}|${r.checkin}|${r.checkout}`}
              type="button"
              onClick={() => applyRecent(r)}
              title={`${r.destination} · ${r.checkin} → ${r.checkout}`}
              className="inline-flex items-center gap-1.5 bg-white/80 hover:bg-white border border-beige-300 rounded-full px-3 py-1 text-xs font-medium text-brand-dark transition-colors max-w-[16rem]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="truncate">{r.destination.split(',')[0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
