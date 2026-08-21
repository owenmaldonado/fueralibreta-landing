-- fonda_gastos, abarrotes_gastos y barberia_caja nunca se agregaron a la
-- publication `supabase_realtime` — a diferencia de negocios/barberia_citas/
-- abarrotes_ventas/fonda_pedidos, un gasto (o una entrada de caja de
-- barbería) registrado desde un dispositivo nunca llegaba a otra pestaña/
-- dispositivo del mismo negocio sin refrescar. No es un problema de RLS
-- entre dueño y empleado: el modo PIN de empleado (negocio_empleados, ver
-- lib/empleados.ts) nunca crea su propia sesión de Auth — auth.uid() sigue
-- siendo el del dueño sin importar quién esté activo en el dispositivo, así
-- que fonda_gastos_owner/abarrotes_gastos_owner/barberia_caja_owner
-- (is_negocio_owner(negocio_id), igual que el resto de las tablas del
-- negocio) ya dejaban pasar el insert de un empleado igual que uno del
-- dueño — solo faltaba avisar a las demás pestañas/dispositivos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fonda_gastos'
  ) then
    alter publication supabase_realtime add table fonda_gastos;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'abarrotes_gastos'
  ) then
    alter publication supabase_realtime add table abarrotes_gastos;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'barberia_caja'
  ) then
    alter publication supabase_realtime add table barberia_caja;
  end if;
end $$;

notify pgrst, 'reload schema';
