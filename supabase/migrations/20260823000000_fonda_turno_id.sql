-- Bug 9: "Ventas" de Hoy en la fonda se veía en $0 tras un refresh lento
-- (se calculaba filtrando por fecha sobre session.fonda.pedidos, que un
-- hard refresh puede pintar vacío antes de que llegue la carga real —
-- ver lib/local-cache.ts). turno_id agrupa los pedidos del turno actual
-- del negocio; el turno vive en localStorage (lib/turno-fonda.ts), no en
-- fecha ni en useState, así sobrevive cualquier refresh y solo se
-- reinicia al "Cerrar turno".
--
-- Nullable a propósito: pedidos de antes de esta columna se quedan sin
-- turno_id — siguen viéndose igual que siempre en Ayer/Semana (que filtran
-- por fecha, sin tocar) y no rompen ningún dato existente.
alter table fonda_pedidos add column if not exists turno_id uuid;
create index if not exists fonda_pedidos_turno_id_idx on fonda_pedidos(turno_id);

notify pgrst, 'reload schema';
