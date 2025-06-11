import type { Metadata } from "next";
import { Geist, Geist_Mono,Inter,VT323,Rajdhani } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const vt323 = VT323({
  weight: '400',
  subsets: ["latin"],
  display: "swap",
  variable: "--font-pixel",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const rajdhani = Rajdhani({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-rajdhani",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XMTP Messaging App",
  description: "A messaging app built with XMTP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${vt323.variable} ${geistMono.variable} ${inter.variable} ${rajdhani.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
