# Supabase: reglas de migraciones

Este repo **no** corre `supabase db push` en CI. Las migraciones de
`supabase/migrations/*.sql` son el registro de lo que el esquema DEBERÍA
tener, pero aplicarlas contra el proyecto real hoy es un paso manual: se
pegan en el SQL Editor del dashboard de Supabase. Eso ya nos causó el mismo
bug varias veces (`empleado_rol_cache`/`empleado_id` "no encontrada" —
PGRST204 — en `barberia_citas`, `barberia_caja`, `fonda_pedidos`,
`fonda_gastos`, `abarrotes_ventas`, `abarrotes_gastos`, `abarrotes_fiados`):
una migración se queda a medias, o el schema cache de PostgREST no se
refresca, y el front manda una columna que el proyecto real todavía no
tiene.

## Reglas

1. **Nunca `ALTER TABLE` directo en el Dashboard.** Todo cambio de esquema
   va primero como archivo en `supabase/migrations/` (nombre
   `YYYYMMDDHHMMSS_descripcion.sql`, timestamp posterior al último archivo
   existente), y ese archivo es lo que se pega en el SQL Editor. Así queda
   el cambio documentado y repetible en cualquier ambiente nuevo.
2. **Toda migración de columna nueva debe ser idempotente**: `add column if
   not exists`, nunca `add column` a secas — debe poder volver a correrse
   sin tronar si ya se aplicó antes (parcial o completa). Mismo criterio
   para constraints/policies: `drop policy if exists` antes de
   `create policy`.
3. **Si alguien hace un ALTER manual de emergencia de todos modos**, debe
   correr `notify pgrst, 'reload schema';` inmediatamente después — si no,
   PostgREST puede seguir sirviendo el schema cache viejo y rechazar
   inserts/updates a la columna que "ya existe" en Postgres pero no en el
   cache. Toda migración de este repo que agregue/renombre columnas termina
   con esa línea por la misma razón.
4. **Ante la duda de si algo llegó a aplicarse en prod**, la migración de
   re-assert correcta es otra migración idempotente (no un `ALTER` suelto
   fuera de `supabase/migrations/`) — ver
   `20260911000000_trazabilidad_empleado_safety_net.sql` como plantilla:
   repite `add column if not exists` para todas las columnas
   `empleado_id`/`empleado_nombre_cache`/`empleado_rol_cache` de las 3
   verticales en un solo archivo, para no tener que adivinar cuál de los
   re-asserts previos sí llegó a correr.
5. **No se borran migraciones viejas** aunque queden "superadas" por una de
   consolidación: son idempotentes, no hacen daño dejarlas, y borrarlas (o
   correr `supabase migration repair`) sin ver el historial real de
   migraciones aplicadas en el proyecto puede desincronizar ese historial
   para quien sí use la CLI más adelante. Si de verdad hace falta limpiar el
   directorio, es una operación a hacer con la CLI conectada al proyecto
   real (`supabase link` + `supabase migration list` para ver qué quedó
   registrado como aplicado), no borrando archivos a mano.

## Resiliencia en el código

Como blindaje adicional (no reemplaza las reglas de arriba, es para que un
drift de un rato no tumbe datos reales mientras se corre la migración que
falta): todos los inserts/updates de `lib/data.ts` — incluida la ruta de
`useSession().update()` (`diffAndSync`) — y los inserts de las bitácoras de
cierre (`barberia_cortes`, `fondita_cortes`/`fondita_mermas`,
`abarrotera_cortes`/`abarrotera_mermas`) pasan por `cleanInsert`/
`cleanUpdate` (`lib/data.ts`): si Supabase responde PGRST204 ("no encuentro
esa columna"), reintentan una vez sin esa columna en vez de perder la fila
completa, y dejan un `console.warn` con el nombre exacto de la columna que
faltó. Esto es un parche, no arregla la causa — sigue haciendo falta correr
la migración pendiente para que esa columna vuelva a guardarse.
