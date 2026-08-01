import type { TenantData } from "./types";

export interface SearchResult {
  label: string;
  sublabel: string;
  href: string;
  group: string;
}

/** Búsqueda universal simple sobre los datos del negocio activo. */
export function universalSearch(data: TenantData, query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: SearchResult[] = [];

  if (data.barberia) {
    for (const c of data.barberia.clientes) {
      if (c.nombre.toLowerCase().includes(q) || c.telefono.includes(q)) {
        results.push({ label: c.nombre, sublabel: c.telefono, href: "/app/clientes", group: "Clientes" });
      }
    }
    for (const cita of data.barberia.citas) {
      if (cita.clienteNombre.toLowerCase().includes(q) || cita.servicioNombre.toLowerCase().includes(q)) {
        results.push({
          label: `${cita.clienteNombre} · ${cita.servicioNombre}`,
          sublabel: `${cita.fecha} ${cita.hora}`,
          href: "/app/agenda",
          group: "Citas",
        });
      }
    }
  }

  if (data.fonda) {
    for (const p of data.fonda.pedidos) {
      if (p.clienteNombre.toLowerCase().includes(q)) {
        results.push({ label: p.clienteNombre, sublabel: `${p.hora} · ${p.estado}`, href: "/app/pedidos", group: "Pedidos" });
      }
    }
    for (const d of data.fonda.platillos) {
      if (d.nombre.toLowerCase().includes(q)) {
        results.push({ label: d.nombre, sublabel: d.categoria, href: "/app/menu", group: "Menú" });
      }
    }
  }

  if (data.abarrotes) {
    for (const p of data.abarrotes.productos) {
      if (p.nombre.toLowerCase().includes(q) || p.codigo.includes(q)) {
        results.push({ label: p.nombre, sublabel: `Stock ${p.stock}`, href: "/app/inventario", group: "Inventario" });
      }
    }
    for (const f of data.abarrotes.fiados) {
      if (f.clienteNombre.toLowerCase().includes(q)) {
        results.push({ label: f.clienteNombre, sublabel: `Debe $${f.saldo}`, href: "/app/fiados", group: "Fiados" });
      }
    }
    for (const a of data.abarrotes.apartados) {
      if (a.clienteNombre.toLowerCase().includes(q)) {
        results.push({ label: a.clienteNombre, sublabel: a.producto, href: "/app/apartados", group: "Apartados" });
      }
    }
  }

  return results.slice(0, 8);
}
