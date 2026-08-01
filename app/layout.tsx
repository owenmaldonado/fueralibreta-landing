import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        {children}
        <Toaster theme="dark" richColors position="top-right" />
      </body>
    </html>
  );
}
