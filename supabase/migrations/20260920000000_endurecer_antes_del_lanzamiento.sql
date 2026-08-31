-- Endurecimiento previo a abrir la app al público.
--
-- Tres cosas encontradas en la auditoría. Ninguna es un hoyo por el que hoy
-- se esté saliendo información de un cliente a otro, pero las tres son
-- cosas que NO quieres tener el día que la app deje de ser solo tuya.
--
--   1. Ocho funciones `security definer` sin `search_path` fijo, entre
--      ellas is_admin() e is_negocio_owner() — de las que cuelga TODO el RLS.
--   2. El PIN se puede probar de a 10,000 sin que nada te detenga.
--   3. La vista de citas públicas se puede bajar completa, de todos los
--      negocios, sin filtro.


-- ============================================================================
-- 1. search_path fijo en las funciones `security definer`
-- ============================================================================
-- Una función `security definer` corre con los permisos de QUIEN LA CREÓ, no
-- de quien la llama. Si además no lleva `search_path` fijo, hereda el del
-- que llama: alguien que pudiera crear una tabla o función en un esquema que
-- vaya antes en ese search_path podría hacer que la función mire SU tabla en
-- vez de la de verdad — y ejecutarla con permisos elevados.
--
-- ¿Se puede hacer eso hoy? No: ni `anon` ni `authenticated` tienen CREATE en
-- el esquema public (lo comprobé). Esto es un cinturón además del tirante.
-- Pero el día que alguna extensión o migración otorgue CREATE, se caería de
-- un golpe TODO el aislamiento entre negocios, porque is_negocio_owner() es
-- la que decide quién ve qué en las 30 y tantas tablas.
--
-- Y hay una segunda razón, más terrenal: verificar_pin_dueno y
-- verificar_pin_empleado llaman a crypt() (pgcrypto), que en Supabase vive
-- en el esquema `extensions`. Hoy funcionan solo porque el search_path del
-- que llama incluye `extensions`. Es exactamente el error que ya nos tocó
-- ver de este mismo tema:
--     ERROR: 42883: function crypt(text, text) does not exist
-- Por eso el search_path que se fija es `public, extensions, pg_temp` y no
-- solo `public`: si fuera solo public, el PIN dejaría de funcionar.
--
-- pg_temp va al final SIEMPRE, y a propósito: si fuera al principio,
-- cualquiera podría crear una tabla temporal que suplante a una real.

alter function public.is_admin()                                set search_path = public, extensions, pg_temp;
alter function public.is_negocio_owner(uuid)                    set search_path = public, extensions, pg_temp;
alter function public.pin_dueno_configurado(uuid)               set search_path = public, extensions, pg_temp;
alter function public.borrar_pin_dueno(uuid)                    set search_path = public, extensions, pg_temp;
alter function public.verificar_pin_dueno(uuid, text)           set search_path = public, extensions, pg_temp;
alter function public.verificar_pin_empleado(uuid, uuid, text)  set search_path = public, extensions, pg_temp;
alter function public.admin_delete_negocios_data(uuid[])        set search_path = public, extensions, pg_temp;
alter function public.handle_new_or_updated_user()              set search_path = public, extensions, pg_temp;

-- Las que ya tenían `search_path = public` a secas: se les agrega
-- extensions y pg_temp para dejarlas todas iguales. Ninguna usa crypt hoy,
-- pero que la regla sea una sola evita el próximo 42883.
alter function public.es_negocio_activo(uuid)                       set search_path = public, extensions, pg_temp;
alter function public.find_or_create_barberia_cliente(uuid, text, text) set search_path = public, extensions, pg_temp;
alter function public.get_citas_por_telefono(uuid, text)            set search_path = public, extensions, pg_temp;
alter function public.negocio_publico_por_slug(text)                set search_path = public, extensions, pg_temp;


-- ============================================================================
-- 2. Candado contra probar el PIN a lo bruto
-- ============================================================================
-- EL PROBLEMA
-- El PIN son 4 dígitos: 10,000 combinaciones. Hay un candado en la pantalla
-- que corta después de varios intentos, pero vive en el NAVEGADOR, y
-- verificar_pin_dueno / verificar_pin_empleado están abiertas a `anon` y
-- `authenticated`. O sea: quien se salte la pantalla y le hable directo a la
-- base (unas líneas de código, nada sofisticado) puede probar las 10,000 sin
-- que nada lo detenga.
--
-- QUÉ TAN GRAVE ES, DE VERDAD
-- Menos de lo que suena, y conviene tenerlo claro: adivinar el PIN NO da
-- acceso a los datos de un negocio ajeno. Para leer ventas o cortes, RLS
-- exige que auth.uid() sea el dueño o un empleado activo — el PIN no cambia
-- eso. Donde SÍ importa es adentro de un mismo negocio, en el celular o
-- tablet que se comparte: un vendedor puede sacarle el PIN al dueño y
-- abrirse el panel de dueño. Ese es justo el caso que hay que cuidar.
--
-- EL CANDADO
-- Va DENTRO de la función, que es el único lugar que no se puede rodear: no
-- importa si la llamada viene de la app, de la Edge Function o de un curl.
-- Cada intento queda registrado (auditoria_pin, la misma tabla que ya
-- usabas para ver quién falló) y si hay demasiados fallos seguidos en poco
-- rato, se deja de responder por un rato.
--
-- Cada "carril" cuenta aparte: los fallos contra el PIN del dueño no
-- bloquean a un vendedor, ni al revés. Si fuera un solo contador por
-- negocio, un vendedor con dedos torpes dejaría a todo el local sin poder
-- entrar en plena hora pico.
--
-- La ventana se cuenta desde el último acierto: si le fallas dos veces y a
-- la tercera entras, el contador vuelve a cero y no te quedas a un intento
-- del bloqueo.
--
-- El costo aceptado: alguien que sepa el id de un negocio puede dejar
-- bloqueado ese carril 15 minutos a propósito. Se cura solo, y es mejor que
-- la alternativa.

create index if not exists auditoria_pin_carril_idx
  on auditoria_pin (negocio_id, empleado_id_intentado, created_at desc);

-- Cuántos fallos seguidos lleva este carril desde el último acierto.
-- p_empleado_id null = el carril del PIN de dueño.
create or replace function public.fallos_recientes_de_pin(
  p_negocio_id uuid,
  p_empleado_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select count(*)::int
  from auditoria_pin a
  where a.negocio_id = p_negocio_id
    and a.empleado_id_intentado is not distinct from p_empleado_id
    and a.exito = false
    and a.created_at > now() - interval '15 minutes'
    and a.created_at > coalesce(
      (select max(b.created_at) from auditoria_pin b
        where b.negocio_id = p_negocio_id
          and b.empleado_id_intentado is not distinct from p_empleado_id
          and b.exito),
      '-infinity'::timestamptz
    );
$$;

revoke all on function public.fallos_recientes_de_pin(uuid, uuid) from public, anon, authenticated;

-- 10 fallos seguidos en 15 minutos y ese carril se cierra.
--
-- Para una persona son de sobra (nadie teclea mal su PIN 10 veces seguidas
-- en cuarto de hora). Para quien lo esté probando a lo bruto son 40 por
-- hora: las 10,000 combinaciones le tomarían más de diez días de estar
-- picándole sin parar, y cada intento queda escrito en auditoria_pin con su
-- hora. En la práctica, muerto.
--
-- Nota: por el carril de empleado, la Edge Function ya escribe su propio
-- renglón por intento, así que ahí cada intento real cuenta doble y el corte
-- efectivo son ~5. También son de sobra.
create or replace function public.verificar_pin_dueno(p_negocio_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_ok boolean;
begin
  if fallos_recientes_de_pin(p_negocio_id, null) >= 10 then
    insert into auditoria_pin (negocio_id, empleado_id_intentado, exito, motivo)
    values (p_negocio_id, null, false, 'bloqueado_por_intentos');
    raise exception 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.'
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from negocio_pin_dueno
    where negocio_id = p_negocio_id and pin_hash = crypt(p_pin, pin_hash)
  ) into v_ok;

  insert into auditoria_pin (negocio_id, empleado_id_intentado, exito, motivo)
  values (p_negocio_id, null, v_ok, case when v_ok then 'pin_correcto' else 'pin_incorrecto' end);

  return v_ok;
end;
$$;

create or replace function public.verificar_pin_empleado(
  p_negocio_id uuid,
  p_empleado_id uuid,
  p_pin text
)
returns table(id uuid, nombre text, rol text, user_id uuid)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_encontrado boolean := false;
begin
  if fallos_recientes_de_pin(p_negocio_id, p_empleado_id) >= 10 then
    insert into auditoria_pin (negocio_id, empleado_id_intentado, exito, motivo)
    values (p_negocio_id, p_empleado_id, false, 'bloqueado_por_intentos');
    raise exception 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.'
      using errcode = 'check_violation';
  end if;

  -- Se resuelve a una tabla temporal primero para poder saber si hubo
  -- resultado ANTES de devolverlo: con `return query` a secas no hay forma
  -- de contar las filas sin perderlas.
  return query
    select e.id, e.nombre, e.rol, e.user_id
    from negocio_empleados e
    where e.id = p_empleado_id
      and e.negocio_id = p_negocio_id
      and e.activo = true
      and e.pin_hash = crypt(p_pin, e.pin_hash);

  v_encontrado := found;

  insert into auditoria_pin (negocio_id, empleado_id_intentado, exito, motivo)
  values (p_negocio_id, p_empleado_id, v_encontrado,
          case when v_encontrado then 'pin_correcto' else 'pin_incorrecto' end);
end;
$$;


-- ============================================================================
-- 3. Las citas públicas ya no se pueden bajar todas de un jalón
-- ============================================================================
-- EL PROBLEMA
-- `barberia_citas_publicas` es una vista SIN `security_invoker`, o sea que
-- corre con los permisos de quien la creó y se salta el RLS de
-- barberia_citas. Y `anon` tenía SELECT sobre ella. Como la vista no filtra
-- por negocio, cualquiera con la llave pública (que va en el navegador, es
-- pública por diseño) podía pedirla SIN filtro y bajarse las citas de TODOS
-- los negocios: negocio_id, fecha, hora, estado y servicio.
--
-- No trae nombres, teléfonos ni precios — eso nunca estuvo ahí. Pero sí
-- deja ver cuántas citas tiene cada negocio y a qué horas, incluido el
-- historial. Para un negocio suelto eso ya es público (está en su propia
-- página de reservas); lo que no debería poderse es sacarlo de todos juntos.
--
-- POR QUÉ NO SE ARREGLA CON security_invoker
-- Poniéndole security_invoker la vista respetaría el RLS de barberia_citas,
-- que no tiene policy de SELECT para anon — y la página de reservas dejaría
-- de ver los huecos ocupados. Se rompería justo lo que la vista existe para
-- resolver. El arreglo es exigir SIEMPRE el negocio, no quitar el permiso.
--
-- La vista se queda (por si algo más la usa y para no romper nada), pero ya
-- no se le puede pedir a la base directo desde el navegador.

create or replace function public.citas_publicas_de_negocio(
  p_negocio_id uuid,
  p_fecha date default null
)
returns table(negocio_id uuid, fecha date, hora time, estado text, servicio_id uuid)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select c.negocio_id, c.fecha, c.hora, c.estado, c.servicio_id
  from barberia_citas c
  where c.negocio_id = p_negocio_id
    and c.estado <> 'cancelada'
    and (p_fecha is null or c.fecha = p_fecha)
    -- Mismo candado que el resto de lo público: de un negocio dado de baja
    -- o suspendido no se contesta nada.
    and es_negocio_activo(c.negocio_id);
$$;

grant execute on function public.citas_publicas_de_negocio(uuid, date) to anon, authenticated;

revoke select on barberia_citas_publicas from anon, authenticated;

notify pgrst, 'reload schema';
