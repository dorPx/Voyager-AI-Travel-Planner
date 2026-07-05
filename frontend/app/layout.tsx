import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ModelProvider } from '@/context/ModelContext';
import { SearchProvider } from '@/context/SearchContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'Voyager — AI Vacation Planner',
  description: 'Plan your perfect vacation with the help of AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ModelProvider>
          <SearchProvider>
            <FavoritesProvider>
            <Header />

            <main className="pt-16 pb-16 lg:pb-0 min-h-screen">{children}</main>

            <footer className="hidden lg:block bg-beige-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-brand-mid">
                © {new Date().getFullYear()} Voyager. All rights reserved.
                {process.env.NODE_ENV === 'development' && (
                  <>
                    {' '}
                    ·{' '}
                    <Link href="/dev" className="underline hover:text-brand-black transition-colors">
                      Dev Dashboard
                    </Link>
                  </>
                )}
              </div>
            </footer>

            <BottomNav />
            </FavoritesProvider>
          </SearchProvider>
        </ModelProvider>
      </body>
    </html>
  );
}
