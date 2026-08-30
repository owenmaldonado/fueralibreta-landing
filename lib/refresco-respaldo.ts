import { fetchTenantData } from "./data";
import type { TenantData } from "./types";

/**
 * Red de seguridad para el realtime: vuelve a traer TODO lo del negocio
 * cada tanto y lo mezcla con lo que ya hay en pantalla.
 *
 * POR QUÉ EXISTE
 * Owen reportó: "estoy probando en 2 dispositivos, como dueño y como
 * empleado; le muevo como empleado y al dueño no le sale hasta que
 * refresca... ya vi que toda la página está así". Y también: "hay cosas
 * que sí y otras que no".
 *
 * Ese "unas sí y otras no" tiene una explicación exacta. De los 7 canales
 * de realtime que arma lib/session.ts, SOLO el de citas tenía red de
 * seguridad: si Realtime se queda callado, un polling cada 25s vuelve a
 * traer las citas y las mete. Los otros seis (ventas, pedidos, gastos,
 * caja, clientes, negocio) llamaban `.subscribe()` a secas — sin callback
 * de estado, sin reintento y sin respaldo. Si el canal no entrega (token
 * de Realtime vencido, WebSocket zombie, la publicación sin la tabla, RLS
 * que filtra el evento, el navegador que congela el socket al poner la
 * pestaña en segundo plano), nadie se entera y esa pantalla se queda
 * congelada hasta un F5.
 *
 * Barbería "funcionaba" porque su pantalla principal son las citas — la
 * única con respaldo. Fonda y Abarrotes no.
 *
 * QUÉ HACE
 * Un solo temporizador por sesión que vuelve a pedir los datos del negocio
 * y los mezcla. Cubre de una sola vez pedidos, ventas, fiados, apartados,
 * gastos, caja, clientes, productos y servicios — los tres giros — sin
 * tener que escribirle un respaldo a cada canal.
 *
 * NO reemplaza al realtime: cuando el canal sí entrega, el cambio se ve al
 * instante y esto no hace nada (la mezcla detecta que no cambió nada y ni
 * siquiera re-renderiza). Es el piso: "esperar un momento" siempre alcanza,
 * nunca hace falta refrescar a mano.
 *
 * LA MEZCLA ES CONSERVADORA A PROPÓSITO
 * Nunca borra algo que está en pantalla y no vino del servidor. Una venta
 * hecha sin señal vive solo en este dispositivo hasta que la cola la sube
 * (ver lib/sync-queue.ts); si este refresco la quitara por "no estar en el
 * servidor", el vendedor vería desaparecer lo que acaba de cobrar. Por eso
 * mezclarLista() conserva las filas locales que el servidor todavía no
 * conoce.
 */

/** Cada cuánto se vuelve a pedir todo. 20s: lo bastante seguido para que se sienta vivo, lo bastante espaciado para no castigar datos móviles. */
const INTERVALO_MS = 20_000;

interface ConId {
  id: string;
}

/**
 * Servidor + lo local que el servidor todavía no conoce.
 *
 * Devuelve EXACTAMENTE el arreglo anterior (`locales`) si nada cambió —
 * esa identidad es la que deja que React se salte el re-render. Sin eso,
 * cada vuelta del temporizador repintaría el dashboard completo cada 20
 * segundos aunque no hubiera pasado nada.
 */
function mezclarLista<T extends ConId>(locales: T[], delServidor: T[]): T[] {
  const idsServidor = new Set(delServidor.map((x) => x.id));
  // Lo que solo existe aquí: ventas offline todavía en la cola, o algo
  // recién creado que aún no termina de subir.
  const soloLocales = locales.filter((x) => !idsServidor.has(x.id));

  const mismosIds =
    soloLocales.length === 0 &&
    locales.length === delServidor.length &&
    delServidor.every((x, i) => locales[i]?.id === x.id);
  if (mismosIds && JSON.stringify(locales) === JSON.stringify(delServidor)) return locales;

  return [...soloLocales, ...delServidor];
}

/** Mezcla los datos frescos del servidor sobre el estado actual, respetando lo local pendiente de subir. */
export function mezclarTenant(actual: TenantData, fresco: TenantData): TenantData {
  const siguiente: TenantData = { ...actual, business: fresco.business };

  if (actual.barberia && fresco.barberia) {
    const a = actual.barberia;
    const f = fresco.barberia;
    siguiente.barberia = {
      ...a,
      servicios: mezclarLista(a.servicios, f.servicios),
      productos: mezclarLista(a.productos, f.productos),
      clientes: mezclarLista(a.clientes, f.clientes),
      citas: mezclarLista(a.citas, f.citas),
      caja: mezclarLista(a.caja, f.caja),
      horario: f.horario,
      excepciones: mezclarLista(a.excepciones, f.excepciones),
    };
  }

  if (actual.fonda && fresco.fonda) {
    const a = actual.fonda;
    const f = fresco.fonda;
    siguiente.fonda = {
      ...a,
      platillos: mezclarLista(a.platillos, f.platillos),
      pedidos: mezclarLista(a.pedidos, f.pedidos),
      gastos: mezclarLista(a.gastos, f.gastos),
    };
  }

  if (actual.abarrotes && fresco.abarrotes) {
    const a = actual.abarrotes;
    const f = fresco.abarrotes;
    siguiente.abarrotes = {
      ...a,
      productos: mezclarLista(a.productos, f.productos),
      ventas: mezclarLista(a.ventas, f.ventas),
      fiados: mezclarLista(a.fiados, f.fiados),
      apartados: mezclarLista(a.apartados, f.apartados),
      gastos: mezclarLista(a.gastos, f.gastos),
    };
  }

  return siguiente;
}

/** ¿Cambió algo de verdad? Si no, quien llama devuelve el estado anterior tal cual y React no repinta. */
export function hayCambios(actual: TenantData, mezclado: TenantData): boolean {
  return JSON.stringify(actual) !== JSON.stringify(mezclado);
}

/**
 * Arranca el refresco de respaldo. Devuelve la función para detenerlo.
 *
 * Se salta la vuelta si la pestaña está en segundo plano (no tiene caso
 * gastar datos móviles refrescando algo que nadie está viendo) o si no hay
 * conexión, y en cambio refresca DE INMEDIATO al volver a primer plano —
 * que es justo cuando el dueño levanta el celular a ver cómo va el día, y
 * el momento en que más se notaba el congelamiento.
 */
export function iniciarRefrescoDeRespaldo(
  leerActual: () => TenantData | null,
  aplicar: (mezclar: (prev: TenantData) => TenantData) => void
): () => void {
  let cancelado = false;
  let enVuelo = false;

  async function refrescar(motivo: string) {
    if (cancelado || enVuelo) return;
    const actual = leerActual();
    if (!actual?.business.ownerId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    enVuelo = true;
    try {
      const fresco = await fetchTenantData(actual.business);
      if (cancelado) return;
      aplicar((prev) => {
        const mezclado = mezclarTenant(prev, fresco);
        if (!hayCambios(prev, mezclado)) return prev;
        console.log(`[session] refresco de respaldo (${motivo}): llegaron cambios que el realtime no entregó`);
        return mezclado;
      });
    } catch (err) {
      // Falla en silencio a propósito: esto es un respaldo, no la fuente
      // principal. Un error de red aquí no debe molestar a nadie ni tirar
      // la sesión — en la siguiente vuelta se reintenta solo.
      console.error("[session] refresco de respaldo falló (se reintenta en la siguiente vuelta):", err);
    } finally {
      enVuelo = false;
    }
  }

  const timer = setInterval(() => refrescar("temporizador"), INTERVALO_MS);

  function alVolverAPrimerPlano() {
    if (document.visibilityState === "visible") refrescar("volviste a la app");
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", alVolverAPrimerPlano);
    window.addEventListener("focus", alVolverAPrimerPlano);
    window.addEventListener("online", () => refrescar("volvió la conexión"));
  }

  return () => {
    cancelado = true;
    clearInterval(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", alVolverAPrimerPlano);
      window.removeEventListener("focus", alVolverAPrimerPlano);
    }
  };
}
