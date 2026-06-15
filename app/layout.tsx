import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studio CRM",
  description: "Pricing & CRM for your design studio",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
