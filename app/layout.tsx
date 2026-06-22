import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coastal Edge Cabinetry and Design",
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
