import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Black Belt Building Dome CAD — 12′ 2V Reference",
  description: "Black Belt Building's interactive 12-foot 2V timber dome reference with individual parts, layers, panel geometry, entrance and platform studies, and explicit release boundaries.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0d0a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
