import { supabase } from "./supabase";

// ============================================================================
// Hub de super admin (/app/admin-hub): registro de las apps/SaaS que viven
// en este proyecto (mis_apps) + estadísticas por app, calculadas a partir de
// negocios.app_slug. Corre con la sesión normal del admin, apoyándose en la
// policy "mis_apps_admin_all" — no necesita la service_role key.
// ============================================================================

// icono/color NO viven aquí: son solo cosméticos y mis_apps en producción no
// tiene esas columnas. Se resuelven en el frontend por slug (ver
// APP_LOOK en components/admin/admin-hub.tsx) para no volver a depender de
// una columna que la tabla real no tiene.
export interface MisApp {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  activo: boolean;
  creadoEn: string;
}

export interface AppConStats extends MisApp {
  totalClientes: number;
  /**
   * "Ingresos" no es un dato uniforme entre apps: cada una guarda sus
   * propias ventas en tablas distintas (barberia_caja, abarrotes_ventas...),
   * y agregar eso genéricamente no tiene sentido todavía. Lo que SÍ es
   * uniforme es lo que TÚ le cobras a cada negocio por usar tu software:
   * MRR estimado = negocios en plan 'pro' bajo esa app × PRECIO_PRO_MXN.
   */
  ingresosMrr: number;
}

export interface AppsConStatsResult {
  apps: AppConStats[];
  /** Si mis_apps no se pudo leer (tabla/columna faltante, RLS, etc.), el mensaje real de Supabase; null si se leyó bien. */
  misAppsError: string | null;
}

const PRECIO_PRO_MXN = 499;

function misAppFromRow(row: Record<string, unknown>): MisApp {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    slug: row.slug as string,
    descripcion: (row.descripcion as string) ?? null,
    activo: row.activo as boolean,
    creadoEn: row.creado_en as string,
  };
}

/**
 * Todas las apps registradas, con total de clientes e ingresos MRR
 * estimados por app. Si mis_apps falla (tabla borrada, RLS rota, etc.) no
 * tira todo el hub: reconstruye una lista mínima a partir de los app_slug
 * que sí existen en negocios, para seguir viendo tus negocios reales aunque
 * el registro de apps esté roto. negocios.select() sí debe funcionar
 * siempre — si falla ese, ahí sí no hay nada que mostrar y se propaga.
 */
export async function fetchAppsConStats(): Promise<AppsConStatsResult> {
  const negociosRes = await supabase.from("negocios").select("app_slug, owner_id");
  if (negociosRes.error) throw negociosRes.error;
  const negocios = (negociosRes.data ?? []) as { app_slug: string; owner_id: string | null }[];

  const ownerIds = Array.from(new Set(negocios.map((n) => n.owner_id).filter((id): id is string => !!id)));
  let planByOwner = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, plan").in("id", ownerIds);
    if (profilesError) throw profilesError;
    planByOwner = new Map((profiles ?? []).map((p) => [p.id as string, p.plan as string]));
  }

  function statsFor(slug: string) {
    const deEstaApp = negocios.filter((n) => n.app_slug === slug);
    const proCount = deEstaApp.filter((n) => n.owner_id && planByOwner.get(n.owner_id) === "pro").length;
    return { totalClientes: deEstaApp.length, ingresosMrr: proCount * PRECIO_PRO_MXN };
  }

  const appsRes = await supabase.from("mis_apps").select("*").order("creado_en", { ascending: true });

  if (!appsRes.error) {
    const apps = (appsRes.data ?? []).map(misAppFromRow).map((app) => ({ ...app, ...statsFor(app.slug) }));
    return { apps, misAppsError: null };
  }

  const slugsEnNegocios = Array.from(new Set(negocios.map((n) => n.app_slug)));
  const slugs = slugsEnNegocios.length > 0 ? slugsEnNegocios : ["fuera-libreta"];
  const apps: AppConStats[] = slugs.map((slug) => ({
    id: slug,
    nombre: slug === "fuera-libreta" ? "Fuera Libreta" : slug,
    slug,
    descripcion: null,
    activo: true,
    creadoEn: "",
    ...statsFor(slug),
  }));
  return { apps, misAppsError: appsRes.error.message };
}

export interface NuevaAppInput {
  nombre: string;
  slug: string;
  descripcion?: string;
}

/** Solo registra la app en mis_apps — no genera ningún código ni ruta. */
export async function createMisApp(input: NuevaAppInput): Promise<void> {
  const { error } = await supabase.from("mis_apps").insert({
    nombre: input.nombre.trim(),
    slug: input.slug.trim(),
    descripcion: input.descripcion?.trim() || null,
    activo: true,
  });
  if (error) throw error;
}

/**
 * Borra el REGISTRO de una app en mis_apps. No toca nada más: los negocios que
 * tuvieran ese app_slug siguen existiendo tal cual, y si la app tenía código
 * (una carpeta en app/app/...), ese código sigue ahí y su URL sigue abriendo.
 * Esto solo la quita de la lista del hub.
 *
 * Existe porque el hub podía crear apps y no borrarlas: cada prueba del botón
 * "+" dejaba una tarjeta permanente. La policy de mis_apps ya permitía DELETE
 * desde el principio (mis_apps_admin_all es FOR ALL) — lo que faltaba era el
 * botón, no el permiso.
 *
 * 'fuera-libreta' se rechaza aquí y no solo en la UI: es el slug por default de
 * negocios.app_slug (ver la migración del esquema), así que borrar su registro
 * dejaría a todos los negocios reales apuntando a una app que el hub ya no
 * conoce.
 */
export async function borrarMisApp(id: string, slug: string): Promise<void> {
  if (slug === "fuera-libreta") {
    throw new Error("Fuera Libreta no se puede quitar: es la app a la que pertenecen tus negocios.");
  }
  const { error } = await supabase.from("mis_apps").delete().eq("id", id);
  if (error) throw error;
}
