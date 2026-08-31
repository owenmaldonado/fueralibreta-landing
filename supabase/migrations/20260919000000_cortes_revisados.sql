-- "Ya lo revisé": apagar el aviso rojo de un cierre sin borrar el dato.
--
-- LO QUE PIDIÓ OWEN
-- "que pueda editar o eliminar el msj de arriba porque sale así en grande y
-- rojo, para que no le salga siempre; solo si lo necesita lo puede borrar,
-- pero que quede ahí guardado, ¿sería bueno que lo pueda editar?"
--
-- El aviso es útil la primera vez y ruido a partir de la segunda: si un
-- faltante ya se aclaró con el vendedor, seguir viéndolo en rojo cada vez que
-- se entra a Cierres solo entrena a ignorarlo — y el día que aparezca uno de
-- verdad, ya no lo va a ver.
--
-- LO QUE **NO** SE PUEDE EDITAR, A PROPÓSITO
-- La diferencia, el efectivo contado y lo esperado se quedan como se
-- registraron. Si el número se pudiera corregir a mano, este reporte dejaría
-- de ser evidencia de nada: cualquiera podría dejarlo en cero y no quedaría
-- rastro. Lo que se agrega es una NOTA al lado — "le di mal el cambio a un
-- cliente" — que explica el faltante sin taparlo.
--
-- Así, dentro de un mes, el dueño no ve solo "faltaron $80" ni "esto ya se
-- revisó": ve las dos cosas, y por qué.

alter table barberia_cortes   add column if not exists revisado_at timestamptz;
alter table barberia_cortes   add column if not exists revisado_nota text;
alter table fondita_cortes    add column if not exists revisado_at timestamptz;
alter table fondita_cortes    add column if not exists revisado_nota text;
alter table abarrotera_cortes add column if not exists revisado_at timestamptz;
alter table abarrotera_cortes add column if not exists revisado_nota text;

notify pgrst, 'reload schema';
