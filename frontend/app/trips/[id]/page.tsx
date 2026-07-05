'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TripItinerary } from '../../../../shared/types';
import ItineraryView from '@/components/ItineraryView';
import ChatPanel from '@/components/ChatPanel';
import PackingListPanel from '@/components/PackingListPanel';
import ToastViewport from '@/components/results/ToastViewport';
import { showToast } from '@/components/results/toast';
import Link from 'next/link';

export default function TripDetailPage({ params }: { params: { id: string } }) {
  const [itinerary, setItinerary] = useState<TripItinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getTrip(params.id)
      .then(setItinerary)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleShare() {
    if (!itinerary?.share_id) return;
    const link = `${window.location.origin}/share/${itinerary.share_id}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Read-only link copied to clipboard');
    } catch {
      showToast(link);
    }
  }

  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>;
  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;
  if (!itinerary) return null;

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Link href="/trips" className="text-sm text-blue-600 hover:underline">← My Trips</Link>
          <h1 className="text-2xl font-bold text-slate-800">{itinerary.name}</h1>
          <div className="ml-auto flex items-center gap-2">
            {itinerary.share_id && (
              <button
                type="button"
                onClick={handleShare}
                className="text-sm font-medium text-brand-black border border-beige-300 bg-white hover:bg-beige-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                Share
              </button>
            )}
            <a
              href={api.itinerary.exportIcsUrl(itinerary.id)}
              className="text-sm font-medium text-brand-black border border-beige-300 bg-white hover:bg-beige-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              Calendar (.ics)
            </a>
          </div>
        </div>
        <ItineraryView itinerary={itinerary} />
      </div>
      <div className="w-96 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
        <PackingListPanel trip={itinerary} />
        <ChatPanel context={JSON.stringify({ destination: itinerary.destination, totalCost: itinerary.total_cost })} />
      </div>
      <ToastViewport />
    </div>
  );
}
