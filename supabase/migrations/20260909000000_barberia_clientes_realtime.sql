-- barberia_clientes nunca se agregó a la publication `supabase_realtime` —
-- a diferencia de barberia_citas/abarrotes_ventas/fonda_pedidos/negocios/
-- *_gastos/barberia_caja, un cliente nuevo dado de alta al agendar una
-- cita (NuevaCitaForm) nunca llegaba a OTRO dispositivo/pestaña del mismo
-- negocio (el dueño viendo /app/clientes en su celular mientras un
-- vendedor agenda en la tablet del mostrador) sin refrescar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'barberia_clientes'
  ) then
    alter publication supabase_realtime add table barberia_clientes;
  end if;
end $$;

notify pgrst, 'reload schema';
