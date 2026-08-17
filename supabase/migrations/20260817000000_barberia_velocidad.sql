-- Barbería más rápida: consumo de inventario simplificado + recordatorio
-- de clientes inactivos configurable.
--
-- Pega este archivo en Supabase → SQL Editor → New query → Run. Es seguro
-- volver a correrlo (usa IF NOT EXISTS donde aplica).

-- Auto-eliminar un producto de Productos cuando su stock llega a 0: antes
-- era un toggle de sesión dentro del modal "Consumir / Eliminar del
-- inventario" (Sheet de la FAB), ahora es un switch POR PRODUCTO que se
-- configura al crear/editar el producto — ver ProductoForm en
-- app/app/productos/page.tsx.
alter table barberia_productos add column if not exists eliminar_en_cero boolean not null default false;

-- Días sin venir a partir de los cuales Clientes marca a alguien con el
-- badge de recordatorio ("Hace Nd") y cambia el mensaje precargado del
-- botón de WhatsApp a una invitación a volver a agendar. Configurable en
-- Configuración > General (app/app/configuracion/page.tsx); 28 por defecto.
alter table negocios add column if not exists dias_recordatorio integer not null default 28;
