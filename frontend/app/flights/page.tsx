'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { FlightResult } from '../../../shared/types';
import FlightCard from '@/components/results/FlightCard';
import { Spinner } from '@/components/results/shared';

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function FlightsPage() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [depart, setDepart] = useState(todayPlus(21));
  const [ret, setRet] = useState(todayPlus(28));
  const [flights, setFlights] = useState<FlightResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    if (!origin.trim() || !destination.trim() || !depart || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.searchFlights({ origin: origin.trim(), destination: destination.trim(), depart, return: ret });
      setFlights(res.flights);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Flight search failed.');
      setFlights(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-black mb-1">Flights</h1>
      <p className="text-sm text-brand-mid mb-6">
        Compare fares across providers. Each result links out to book the route.
      </p>

      <div className="bg-white border border-beige-300 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-brand-mid">From</span>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="New York"
            className="border border-beige-300 bg-white rounded-lg px-3 py-2 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-brand-mid">To</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Paris"
            className="border border-beige-300 bg-white rounded-lg px-3 py-2 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-brand-mid">Depart</span>
          <input
            type="date"
            value={depart}
            onChange={(e) => setDepart(e.target.value)}
            className="border border-beige-300 bg-white rounded-lg px-3 py-2 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-brand-mid">Return</span>
          <input
            type="date"
            value={ret}
            onChange={(e) => setRet(e.target.value)}
            className="border border-beige-300 bg-white rounded-lg px-3 py-2 text-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </label>
        <button
          type="button"
          onClick={search}
          disabled={loading || !origin.trim() || !destination.trim()}
          className="bg-sky-400 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          {loading ? 'Searching…' : 'Search flights'}
        </button>
      </div>

      <div className="mt-6">
        {loading && <Spinner label="Checking fares across providers…" />}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && flights && flights.length === 0 && (
          <p className="text-sm text-brand-mid text-center py-10">
            No fares found for that route and dates. Try different cities or dates.
          </p>
        )}
        {flights && flights.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-brand-mid">{flights.length} fares found</p>
            {flights.map((f) => (
              <FlightCard key={f.id} {...f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
