import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Strategy Simulator",
  description: "AI-powered choose-your-own-adventure strategy simulator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b bg-card">
          <div className="container mx-auto flex h-14 items-center px-4">
            <Link href="/" className="font-bold text-lg">
              Strategy Simulator
            </Link>
            <nav className="ml-8 flex items-center gap-4 text-sm">
              <Link
                href="/scenarios"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Scenarios
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 container mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
