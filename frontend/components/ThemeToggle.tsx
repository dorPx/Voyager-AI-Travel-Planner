'use client';

import { useCallback, useEffect, useState } from 'react';

// Three-state theme control: system (default) → light → dark. The choice
// persists in localStorage and is pre-applied before hydration by the inline
// script in app/layout.tsx, so there is no flash of the wrong theme.

const STORAGE_KEY = 'voyager:theme';

type ThemeChoice = 'system' | 'light' | 'dark';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

function readStored(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    return 'system';
  }
}

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };

const LABELS: Record<ThemeChoice, string> = {
  system: 'Theme: system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === 'light') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (choice === 'dark') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    );
  }
  // system: half sun / half moon
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M12 7a5 5 0 0 1 0 10" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    setChoice(readStored());
  }, []);

  // In system mode, follow live OS theme changes.
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((prev) => {
      const next = NEXT[prev];
      try {
        if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* best-effort */
      }
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${LABELS[choice]} — click to change`}
      aria-label={`${LABELS[choice]} — click to change`}
      className="flex items-center justify-center w-8 h-8 rounded-lg border border-beige-300 bg-white text-brand-mid hover:text-brand-black hover:border-brand-mid transition-colors"
    >
      <ThemeIcon choice={choice} />
    </button>
  );
}
