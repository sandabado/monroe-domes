import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jantsz Dome CAD — 12′ V2 Geometry",
  description: "Topology-derived 12-foot V2 geodesic dome workbench with individual timber inspection, layers, orthographic views, and canonical schedules.",
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
