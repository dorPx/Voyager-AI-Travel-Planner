'use client';

import type { FlightResult } from '../../../shared/types';
import { formatDuration, formatTime } from './shared';
import { useCurrency } from '@/context/CurrencyContext';

function stopsBadge(stops: number) {
  if (stops === 0) {
    return { label: 'Nonstop', className: 'bg-emerald-100 text-emerald-700' };
  }
  if (stops === 1) {
    return { label: '1 stop', className: 'bg-amber-100 text-amber-700' };
  }
  return { label: `${stops} stops`, className: 'bg-red-100 text-red-700' };
}

export default function FlightCard(props: FlightResult) {
  const { airline, price, departure, arrival, duration_minutes, stops } = props;
  const badge = stopsBadge(stops);
  const { format } = useCurrency();

  return (
    <div className="bg-white rounded-xl border-[0.5px] border-beige-300 p-4 flex items-center justify-between gap-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-beige-200 flex items-center justify-center text-sm font-semibold text-brand-dark flex-shrink-0">
          {airline.charAt(0).toUpperCase()}
        </div>
        <p className="text-sm font-medium text-brand-black truncate">{airline}</p>
      </div>

      <div className="flex flex-col items-center text-xs text-brand-mid">
        <span className="text-sm font-medium text-brand-black">
          {formatTime(departure)} → {formatTime(arrival)}
        </span>
        <span>{formatDuration(duration_minutes)}</span>
      </div>

      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${badge.className}`}>
        {badge.label}
      </span>

      <span className="text-xl font-bold text-sky-400 whitespace-nowrap">{format(price)}</span>
    </div>
  );
}
