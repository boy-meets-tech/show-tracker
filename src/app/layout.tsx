import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Telemetry } from "@/components/Telemetry";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Show Tracker", template: "%s · Show Tracker" },
  description: "Keep track of the shows and movies you and your friends are watching.",
  applicationName: "Show Tracker",
  // Opening from the iPhone Home Screen shows the app full screen, without Safari's bars.
  appleWebApp: { capable: true, title: "Show Tracker", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // Let the page reach the screen edges on iPhones; the nav bars then pad
  // themselves clear of the rounded corners and home bar (safe-area insets).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <Telemetry />
      </body>
    </html>
  );
}
