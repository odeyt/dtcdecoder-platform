import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CategoryNav } from "@/components/CategoryNav";
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
  title: {
    default: "DTCDecoder — Wiring Diagrams & Automotive Software",
    template: "%s | DTCDecoder",
  },
  description:
    "Buy vehicle-specific wiring diagrams and automotive diagnostic software as instant digital downloads.",
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
        <CategoryNav />
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
