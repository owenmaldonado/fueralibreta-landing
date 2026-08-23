// Generado por scripts/generate-sw.mjs en cada build (ver "prebuild"/"predev"
// en package.json) — no edites public/sw.js a mano, los cambios se pierden en
// el siguiente build. Edita este archivo.
//
// Cachea SOLO el shell de la app (HTML de navegación ya visitada + fallback
// offline, JS/CSS/fuentes de /_next/static). Nunca cachea Supabase ni /api/*
// — esas peticiones siempre van directo a la red, con o sin conexión.
const CACHE_VERSION = "2026-08-23T20:01:25.081Z";
const PRECACHE = `fl-precache-${CACHE_VERSION}`;
const RUNTIME_CACHE = `fl-runtime-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([PRECACHE, RUNTIME_CACHE]);

const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/icon-512-transparent.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // No esperar a que se cierren las pestañas viejas: el usuario debe
      // recibir la actualización apenas se instala, no hasta que cierre todo.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.has(key)).map((key) => caches.delete(key))))
      // Toma control de las pestañas ya abiertas sin esperar a que naveguen de nuevo.
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(PRECACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await networkPromise) || Response.error();
}

async function networkFirstNavigate(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) runtimeCache.put(request, response.clone());
    return response;
  } catch {
    // Sin red: sirve la última copia cacheada de ESTA ruta si existe (para
    // que abra con lo último que vio, aunque sin datos frescos); si nunca se
    // visitó offline, cae al shell genérico en vez del error del navegador.
    const cached = await runtimeCache.match(request);
    if (cached) return cached;
    const offline = await caches.match("/offline.html");
    return offline || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca tocar Supabase ni /api/* — siempre red, sin caché de por medio.
  if (url.hostname.endsWith("supabase.co") || url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  // JS/CSS/fuentes de Next (nombres con hash de contenido -> inmutables).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
