'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import { useCurrency, CURRENCIES, type Currency } from '@/context/CurrencyContext';

function PlaneIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1 .1-1.3.5l-.4.6c-.4.5-.2 1.2.3 1.5L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.6 5.7c.3.5 1 .7 1.5.3l.6-.4c.4-.3.6-.8.5-1.3Z" />
    </svg>
  );
}

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const { currency, setCurrency } = useCurrency();

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 10);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 h-16 bg-white border-b border-beige-300 transition-shadow ${
        scrolled ? 'shadow-md' : ''
      }`}
    >
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-brand-black">
          <PlaneIcon />
          <span className="text-lg font-semibold tracking-tight">Voyager</span>
        </Link>

        <div className="flex-1" />

        <nav className="flex items-center gap-4 sm:gap-6">
          <Link href="/flights" className="hidden sm:inline text-sm font-medium text-brand-mid hover:text-brand-black transition-colors">
            Flights
          </Link>
          <Link href="/itinerary" className="hidden sm:inline text-sm font-medium text-brand-mid hover:text-brand-black transition-colors">
            Plan with AI
          </Link>
          <Link href="/trips" className="hidden sm:inline text-sm font-medium text-brand-mid hover:text-brand-black transition-colors">
            Saved Trips
          </Link>
          <label className="flex items-center">
            <span className="sr-only">Display currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="text-xs font-semibold text-brand-black bg-white border border-beige-300 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none hover:border-brand-mid transition-colors"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
