#!/usr/bin/env node
// Estampa un CACHE_VERSION nuevo en public/sw.js en cada build (ver
// "prebuild"/"predev" en package.json) — así cada deploy invalida los
// cachés viejos del service worker sin que haya que acordarse de subir un
// número a mano.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "sw-template.js");
const publicDir = path.join(__dirname, "..", "public");
const outPath = path.join(publicDir, "sw.js");

// VERCEL_GIT_COMMIT_SHA da una versión estable por commit en producción
// (evita invalidar cachés en rebuilds sin cambios reales); fuera de Vercel
// (local, CI) cae a un timestamp, que igual siempre es una versión nueva.
const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_VERSION || new Date().toISOString();

const template = readFileSync(templatePath, "utf8");
const output = template.replace("__CACHE_VERSION__", version);

mkdirSync(publicDir, { recursive: true });
writeFileSync(outPath, output);
console.log(`[generate-sw] public/sw.js generado con CACHE_VERSION=${version}`);
