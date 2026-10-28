import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TuneFetch — Playlist downloads, made simple",
  description:
    "Organize supported, authorized audio downloads in one clean workspace. Preview your playlist and choose an output quality.",
  applicationName: "TuneFetch",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
