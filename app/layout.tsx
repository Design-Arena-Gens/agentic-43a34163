import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gentle check-in (5s)',
  description: 'ASMR-styled dental probe loop with caption overlay',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <div aria-hidden className="sr-only" id="captions">Gentle check-in, five seconds loop. Whisper: Relax your jaw for me.</div>
      </body>
    </html>
  );
}
