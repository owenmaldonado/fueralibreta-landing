import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { ConsentBanner } from "@/components/ConsentBanner";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "FUERA LIBRETA — Sistemas para negocios de Tepic",
  description:
    "Software a la medida para barberías, fondas y abarrotes de Tepic, Nayarit. Deja la libreta, controla tu negocio desde el celular.",
  keywords: [
    "sistema para negocios Tepic",
    "software barberías",
    "software fondas",
    "punto de venta abarrotes",
    "Nayarit",
  ],
  openGraph: {
    title: "FUERA LIBRETA — Sistemas para negocios de Tepic",
    description:
      "Deja la libreta. Controla ventas, fiados y clientes desde el celular.",
    locale: "es_MX",
    type: "website",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Fuera Libreta",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX" className="dark">
      <head>
        {/* El SplashScreen del arranque (ver authenticated-shell.tsx) usa este
            ícono a 120px — precargarlo evita el medio segundo de logo
            borroso/placeholder mientras el navegador lo descarga y decodifica
            recién al pintar la pantalla. */}
        <link rel="preload" as="image" href="/icons/icon-maskable-512.png" />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
        <ConsentBanner />
        <Toaster theme="dark" richColors position="top-right" />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
