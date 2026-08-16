// Content-Security-Policy: la app no carga scripts/estilos externos (fuentes
// vía next/font, sin Google Analytics ni CDNs) así que default-src 'self' no
// rompe nada. 'unsafe-inline' en script-src es necesario porque Next.js (App
// Router) inyecta el payload de hidratación en <script> inline sin nonce por
// defecto — ese es el único hueco que deja abierto; connect-src limitado a
// Supabase evita que ese hueco sirva para exfiltrar datos a otro dominio.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera=(self): el escáner de código de barras de /app/inventario (abarrotes) la necesita.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Content-Security-Policy", value: CSP },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        // El navegador revisa bytes del SW en cada carga, pero solo si su
        // propia caché HTTP no lo esconde primero — sin esto, un despliegue
        // nuevo puede tardar hasta 24h en notarse (ver skipWaiting/clientsClaim
        // en public/sw.js, que resuelven la otra mitad del problema).
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
