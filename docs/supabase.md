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

## Row Level Security (RLS)

Owen reportó el dashboard de Supabase mostrando TODAS las tablas como
"Public" (sin restricción). Verificado: no era falsa alarma. El código de
este repo (`20260815000000_esquema.sql`) siempre definió RLS correcto en
cada tabla, pero `20260902000000_fix_citas_publicas_rls_realtime.sql`
documenta que alguna vez se **deshabilitó RLS a mano** en el proyecto real
(Table Editor) sobre `barberia_citas`/`barberia_clientes` "para revertir"
otro problema, junto con GRANTs amplios a `anon`/`authenticated` en varias
tablas — ese incidente se corrigió puntual para esas 2 tablas, pero el
mismo Table Editor pudo haber tocado otras, o el script gigante de
20260815 nunca terminó de aplicarse completo la primera vez (mismo
síndrome que las columnas `empleado_*`). `20260911000001_rls_seguridad.sql`
re-aplica el estado correcto y completo de una sola pasada — **hay que
correrlo en el SQL Editor**.

### Cómo funciona el modelo de acceso

Todo dato de negocio vive detrás de `is_negocio_owner(negocio_id)`
(función `security definer` definida en `20260815000000_esquema.sql`):

```sql
is_negocio_owner(p_negocio_id) = TRUE si
  auth.uid() = negocios.owner_id del negocio, O
  auth.uid() = negocio_empleados.user_id de un empleado activo de ese negocio
```

`auth.uid()` es el uuid de la sesión de Supabase Auth actual — nativo de
Supabase, no hay que fabricarlo con `current_setting()` ni comparaciones
manuales. Los empleados con PIN (ver `lib/empleados.ts`) NO tienen su
propia cuenta de Supabase Auth — la sesión real sigue siendo la del dueño
(guardada en el navegador), y "quién está atendiendo" es una cookie propia
de la app (`fl_empleado`), no algo que RLS necesite saber: `auth.uid()`
sigue siendo el dueño sin importar qué empleado esté operando el
dispositivo. El segundo `OR` de la función existe para un futuro "empleado
con cuenta propia" (columna `user_id`, hoy siempre null).

Cada tabla de negocio (`barberia_*`, `fonda_*`/`fondita_*`, `abarrotes_*`/
`abarrotera_*`, `negocio_empleados`, `auditoria_pin`) tiene:
- Una policy `<tabla>_owner` (`for all`) con `is_negocio_owner(negocio_id)`
  — o, en tablas hijas sin columna `negocio_id` propia (`fonda_variantes`,
  `fonda_pedido_items`, `abarrotes_lotes`, `abarrotes_sale_items`,
  `abarrotes_fiado_movimientos`), un `exists (select ... from <tabla_padre>
  where ... and is_negocio_owner(...))`.
- Una policy `<tabla>_admin_all` (`for all`) con `is_admin()` — para que
  `/admin` administre cualquier negocio sin pasar por `service_role`.

Excepciones deliberadas, no bugs:
- **`negocio_pin_dueno`**: RLS habilitado, CERO policies. Nadie —ni
  siquiera el dueño— puede leer `pin_hash` directo por la API; solo las
  funciones `security definer` (`set_pin_dueno`, `verificar_pin_dueno`,
  etc.) tocan esta tabla.
- **`barberia_clientes`**: sin policy pública — nombre/teléfono de todos
  los clientes de un negocio nunca es legible por `anon`. La reserva
  pública resuelve/crea un cliente vía una función `security definer`
  (`find_or_create_barberia_cliente`), nunca leyendo la tabla directo.
- **Landing/reserva pública** (`anon`, sin sesión): solo puede
  **insertar** — nunca leer — en `barberia_citas` (con
  `estado='pendiente'` y negocio activo), `contactos`, `leads`,
  `consentimientos`. Puede **leer** `barberia_servicios`/`barberia_horario`/
  `barberia_excepciones` de negocios activos (para pintar el formulario de
  reserva) y la vista `barberia_citas_publicas` (solo
  `negocio_id, fecha, hora, estado` — sin nombre/teléfono — para calcular
  huecos disponibles).

RLS es la barrera real; un `GRANT` amplio a `anon`/`authenticated` sobre
una tabla (aunque exista por error, como pasó en el incidente de arriba)
NO salta RLS — sigue haciendo falta pasar la policy fila por fila (`anon`/
`authenticated` nunca tienen el atributo `BYPASSRLS`). Por eso
re-asegurar RLS + policies (este archivo) cierra el hueco aunque no se
sepa con certeza qué GRANTs manuales quedaron sueltos en el proyecto real.

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
