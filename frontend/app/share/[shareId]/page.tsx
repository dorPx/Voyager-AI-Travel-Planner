'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { TripItinerary } from '../../../../shared/types';
import ItineraryView from '@/components/ItineraryView';

// Public read-only view of a shared trip. Reached via the share token, not
// the trip id — no edit, chat, or delete affordances here.

export default function SharedTripPage({ params }: { params: { shareId: string } }) {
  const [itinerary, setItinerary] = useState<TripItinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.itinerary.getShared(params.shareId)
      .then(setItinerary)
      .catch(() => setError('This shared trip could not be found. The link may be invalid or the trip was deleted.'))
      .finally(() => setLoading(false));
  }, [params.shareId]);

  if (loading) return <div className="text-center py-20 text-brand-mid">Loading shared trip…</div>;

  if (error || !itinerary) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-lg font-medium text-brand-black mb-2">Trip not found</p>
        <p className="text-sm text-brand-mid mb-6">{error}</p>
        <Link href="/" className="text-sm font-semibold text-sky-400 hover:text-sky-500 hover:underline">
          Plan your own trip →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">{itinerary.name}</h1>
          <p className="text-sm text-brand-mid">Shared itinerary · read-only</p>
        </div>
        <Link
          href="/"
          className="bg-sky-400 hover:bg-sky-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Plan your own trip
        </Link>
      </div>
      <ItineraryView itinerary={itinerary} />
    </div>
  );
}
