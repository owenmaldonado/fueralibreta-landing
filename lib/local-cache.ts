import Dexie, { type Table } from "dexie";

import { supabase } from "./supabase";
import type {
  Business,
  GroceryProduct,
  Dish,
  BarberService,
  InventoryProduct,
  BarberClient,
  Empleado,
  RolEmpleado,
  TenantData,
} from "./types";

/**
 * Catálogo local (Parte 2 de PWA) — SOLO productos/precios, clientes y
 * empleados del negocio activo, para que la pantalla de venta pinte al
 * instante y siga funcionando sin señal. Nada de ventas/citas/pedidos/fiados
 * vive aquí todavía (eso es sincronización, Parte 3) — se reconstruyen
 * vacíos al leer el caché, ver leerCacheLocal().
 *
 * Una base de Dexie POR NEGOCIO ("inventario_{negocio_id}") en vez de una
 * sola base con negocio_id como columna: así "limpiar todo si cambia el
 * negocio_id" es un simple Dexie.delete(nombre) de la base vieja, sin tener
 * que filtrar/borrar filas una por una.
 */

interface MetaRow {
  key: string;
  value: string;
}

class InventarioDB extends Dexie {
  negocio!: Table<Business, string>;
  grocery_productos!: Table<GroceryProduct, string>;
  fonda_platillos!: Table<Dish, string>;
  barberia_servicios!: Table<BarberService, string>;
  barberia_productos!: Table<InventoryProduct, string>;
  clientes!: Table<BarberClient, string>;
  empleados!: Table<Empleado, string>;
  meta!: Table<MetaRow, string>;

  constructor(negocioId: string) {
    super(`inventario_${negocioId}`);
    this.version(1).stores({
      negocio: "id",
      grocery_productos: "id",
      fonda_platillos: "id",
      barberia_servicios: "id",
      barberia_productos: "id",
      clientes: "id",
      empleados: "id",
      meta: "key",
    });
  }
}

/** Igual patrón que conTimeout en lib/session.ts / lib/empleados.ts — evita
 * que un logout se quede colgado si deleteDatabase() se bloquea esperando
 * que otra pestaña cierre su conexión a la misma base. */
function conTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms) en local-cache`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function disponible(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

const PUNTERO_KEY = "fl_local_cache_negocio_activo";

interface Puntero {
  userId: string;
  negocioId: string;
}

function leerPuntero(): Puntero | null {
  try {
    const raw = window.localStorage.getItem(PUNTERO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.userId === "string" && typeof parsed.negocioId === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function escribirPuntero(p: Puntero) {
  try {
    window.localStorage.setItem(PUNTERO_KEY, JSON.stringify(p));
  } catch {
    // localStorage no disponible (modo privado estricto, etc.): la app sigue
    // funcionando en línea, solo sin el atajo offline de este dispositivo.
  }
}

function borrarPuntero() {
  try {
    window.localStorage.removeItem(PUNTERO_KEY);
  } catch {
    // ver comentario de escribirPuntero.
  }
}

async function borrarBaseDeNegocio(negocioId: string): Promise<void> {
  try {
    await conTimeout(Dexie.delete(`inventario_${negocioId}`), 5000);
  } catch (err) {
    console.error("[local-cache] no se pudo borrar el catálogo local de", negocioId, err);
  }
}

/** negocio_empleados no vive en TenantData (ver lib/session.ts) — se pide
 * aparte, solo para poder cachearlo aquí. Falla en silencio (igual que el
 * resto del módulo): si esta query truena, productos/precios/clientes
 * igual se guardan bien. */
async function fetchEmpleadosParaCache(negocioId: string): Promise<Empleado[]> {
  const { data, error } = await supabase.from("negocio_empleados").select("*").eq("negocio_id", negocioId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    negocioId: r.negocio_id as string,
    nombre: r.nombre as string,
    rol: r.rol as RolEmpleado,
    activo: r.activo as boolean,
    userId: (r.user_id as string | null) ?? undefined,
    createdAt: r.created_at as string,
  }));
}

/**
 * Guarda el catálogo del negocio activo para lectura offline — se llama en
 * segundo plano cada vez que useSession() resuelve datos frescos de
 * Supabase (ver sincronizarCacheLocalEnSegundoPlano), nunca bloquea la UI.
 *
 * Si el negocio_id (o el userId) cambió desde la última vez que se guardó
 * algo en este dispositivo, borra la base vieja completa ANTES de escribir
 * la nueva — cubre tanto "multi-sucursal a futuro" como "otra cuenta usó
 * este mismo celular sin pasar por logout".
 */
async function guardarCacheLocal(userId: string, tenant: TenantData, empleados: Empleado[]): Promise<void> {
  if (!disponible()) return;
  const negocioId = tenant.business.id;

  const anterior = leerPuntero();
  if (anterior && (anterior.negocioId !== negocioId || anterior.userId !== userId)) {
    await borrarBaseDeNegocio(anterior.negocioId);
  }
  escribirPuntero({ userId, negocioId });

  const db = new InventarioDB(negocioId);
  try {
    await db.transaction(
      "rw",
      [db.negocio, db.grocery_productos, db.fonda_platillos, db.barberia_servicios, db.barberia_productos, db.clientes, db.empleados, db.meta],
      async () => {
        await db.negocio.clear();
        await db.negocio.put(tenant.business);

        await db.grocery_productos.clear();
        if (tenant.abarrotes) await db.grocery_productos.bulkPut(tenant.abarrotes.productos);

        await db.fonda_platillos.clear();
        if (tenant.fonda) await db.fonda_platillos.bulkPut(tenant.fonda.platillos);

        await db.barberia_servicios.clear();
        await db.barberia_productos.clear();
        await db.clientes.clear();
        if (tenant.barberia) {
          await db.barberia_servicios.bulkPut(tenant.barberia.servicios);
          await db.barberia_productos.bulkPut(tenant.barberia.productos);
          await db.clientes.bulkPut(tenant.barberia.clientes);
        }

        await db.empleados.clear();
        await db.empleados.bulkPut(empleados);

        await db.meta.put({ key: "lastSync", value: new Date().toISOString() });
      }
    );
  } catch (err) {
    console.error("[local-cache] no se pudo guardar el catálogo local:", err);
  } finally {
    db.close();
  }
}

/**
 * Refresca el catálogo local en segundo plano — fire-and-forget a propósito
 * (no se espera desde useSession(): nunca debe bloquear ni retrasar el
 * pintado de la sesión en memoria).
 */
export function sincronizarCacheLocalEnSegundoPlano(userId: string, tenant: TenantData): void {
  if (!disponible()) return;
  fetchEmpleadosParaCache(tenant.business.id)
    .catch((err) => {
      console.error("[local-cache] no se pudieron cargar empleados para el caché local:", err);
      return [] as Empleado[];
    })
    .then((empleados) => guardarCacheLocal(userId, tenant, empleados))
    .catch((err) => console.error("[local-cache] no se pudo sincronizar el catálogo local:", err));
}

export interface CacheLocalSnapshot {
  tenant: TenantData;
  empleados: Empleado[];
  lastSync: string | null;
}

/**
 * Lee el catálogo cacheado para ESTE userId (el puntero guarda de quién es
 * el caché — si no coincide, no se devuelve nada, para que un dispositivo
 * compartido nunca muestre el negocio de la cuenta anterior antes de que
 * termine de resolver la sesión real).
 */
export async function leerCacheLocal(userId: string): Promise<CacheLocalSnapshot | null> {
  if (!disponible()) return null;
  const puntero = leerPuntero();
  if (!puntero || puntero.userId !== userId) return null;

  const db = new InventarioDB(puntero.negocioId);
  try {
    const business = await db.negocio.get(puntero.negocioId);
    if (!business) return null;

    const [grocery, platillos, servicios, productosBarberia, clientes, empleados, metaLastSync] = await Promise.all([
      db.grocery_productos.toArray(),
      db.fonda_platillos.toArray(),
      db.barberia_servicios.toArray(),
      db.barberia_productos.toArray(),
      db.clientes.toArray(),
      db.empleados.toArray(),
      db.meta.get("lastSync"),
    ]);

    const tenant: TenantData = {
      business,
      abarrotes:
        business.tipo === "abarrotes" ? { productos: grocery, ventas: [], fiados: [], apartados: [], gastos: [] } : undefined,
      fonda: business.tipo === "fonda" ? { platillos, pedidos: [], gastos: [] } : undefined,
      barberia:
        business.tipo === "barberia"
          ? { servicios, productos: productosBarberia, clientes, citas: [], caja: [], horario: [], excepciones: [] }
          : undefined,
    };

    return { tenant, empleados, lastSync: metaLastSync?.value ?? null };
  } catch (err) {
    console.error("[local-cache] no se pudo leer el catálogo local:", err);
    return null;
  } finally {
    db.close();
  }
}

/** Logout / cambio de cuenta en este dispositivo — borra TODO el catálogo local del negocio activo. */
export async function limpiarCacheLocal(): Promise<void> {
  if (!disponible()) return;
  const puntero = leerPuntero();
  borrarPuntero();
  if (puntero) await borrarBaseDeNegocio(puntero.negocioId);
}

/** Para el indicador "Actualizado: hace X" del TopBar — no requiere userId, solo lee la base del negocio dado. */
export async function leerUltimaSincronizacion(negocioId: string): Promise<string | null> {
  if (!disponible()) return null;
  const db = new InventarioDB(negocioId);
  try {
    const row = await db.meta.get("lastSync");
    return row?.value ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}
