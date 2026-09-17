import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    `localhost:${process.env.PORT ?? "3000"}`;
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "Screenjoy — Game of Life and tiny screensavers",
    description:
      "Explore Conway's Game of Life and standalone screensaver web components.",
    openGraph: {
      title: "Screenjoy",
      description: "Tiny wandering things for the web — now evolving one cell at a time.",
      url: origin,
      siteName: "Screenjoy",
      type: "website",
      images: [
        {
          url: `${origin}/og-game-of-life.png`,
          width: 1536,
          height: 1024,
          alt: "Screenjoy Game of Life — simple rules, endless life.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Screenjoy",
      description: "Conway's Game of Life and tiny standalone screensaver components.",
      images: [`${origin}/og-game-of-life.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
