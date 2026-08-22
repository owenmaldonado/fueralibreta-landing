-- Red de seguridad para la migración 20260911000006: el índice único
-- parcial (negocio_id, normalizar_telefono_mx(telefono)) que se creó ahí
-- solo puede existir si NO hay ya filas duplicadas por teléfono normalizado
-- en barberia_clientes de ANTES de que existiera la deduplicación (clientes
-- creados por el link público con distinto formato de teléfono, +52,
-- espacios, guiones). Si esas filas ya existían, "create unique index" de
-- 20260911000006 falló silenciosamente en algunos flujos de ejecución sin
-- avisar (dependiendo de cómo se corrió el script), dejando la función
-- corregida pero el índice sin crear.
--
-- Esta migración es idempotente y segura de correr aunque no haya
-- duplicados (no hace nada en ese caso):
--   1. Para cada grupo (negocio_id, telefono normalizado) con más de una
--      fila, elige un "ganador" (el que ya tiene nombre no vacío, luego el
--      de más visitas, luego el más antiguo por created_at si existiera esa
--      columna — barberia_clientes no tiene created_at, así que se usa id
--      como desempate determinista).
--   2. Reasigna barberia_citas.cliente_id de los duplicados "perdedores" al
--      ganador (para no perder el historial de citas ya agendadas).
--   3. Suma las visitas de los perdedores al ganador.
--   4. Borra las filas perdedoras.
--   5. Re-crea el índice único (ya no debería fallar).

do $$
declare
  r record;
  v_ganador uuid;
begin
  for r in
    select negocio_id, normalizar_telefono_mx(telefono) as tel_norm, array_agg(id order by (trim(nombre) = ''), visitas desc, id) as ids
    from barberia_clientes
    where normalizar_telefono_mx(telefono) <> ''
    group by negocio_id, normalizar_telefono_mx(telefono)
    having count(*) > 1
  loop
    v_ganador := r.ids[1];

    update barberia_citas
    set cliente_id = v_ganador
    where cliente_id = any(r.ids[2:array_length(r.ids, 1)]);

    update barberia_clientes
    set visitas = visitas + coalesce((
      select sum(visitas) from barberia_clientes where id = any(r.ids[2:array_length(r.ids, 1)])
    ), 0)
    where id = v_ganador;

    delete from barberia_clientes where id = any(r.ids[2:array_length(r.ids, 1)]);
  end loop;
end $$;

drop index if exists barberia_clientes_negocio_telefono_norm_idx;
create unique index barberia_clientes_negocio_telefono_norm_idx
  on barberia_clientes (negocio_id, normalizar_telefono_mx(telefono))
  where normalizar_telefono_mx(telefono) <> '';
