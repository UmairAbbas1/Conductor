import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = {
  title: "Conductor · one voice per buyer",
  description: "Coordinates every autonomous touch aimed at the same buyer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const live = process.env.CONDUCTOR_MODE === "live";
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-line bg-panel text-accent">◎</span>
            <span className="font-display text-2xl tracking-tight">Conductor</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-soft">
            <Link href="/" className="hover:text-text">Accounts</Link>
            <Link href="/mirror/sarah" className="hover:text-text">Buyer Mirror</Link>
            <Link href="/replay" className="hover:text-text">Replay</Link>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs ${live ? "border-good/40 text-good" : "border-warn/40 text-warn"}`}>
              {live ? "LIVE" : "DRY RUN"}
            </span>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-6 pb-16">{children}</main>
      </body>
    </html>
  );
}
