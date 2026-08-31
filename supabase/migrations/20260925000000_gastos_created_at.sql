-- Que los GASTOS también arranquen en cero al abrir turno.
--
-- EL BUG QUE CIERRA (Owen: "en la misma fonda los gastos no se van a 0, se
-- cuenta lo de todo el día en vez de iniciar en cero, así que ocupo que
-- inicie en cero para que saquen bien las cuentas y no cuenten gastos
-- pasados... lo mismo de los gastos con abarrotera")
--
-- Las VENTAS ya arrancaban en cero en cada turno: fonda_pedidos y
-- abarrotes_ventas guardan un instante, así que lib/turno.ts puede decir de
-- qué lado del último cierre cayó cada una. Los GASTOS no: fonda_gastos y
-- abarrotes_gastos solo tenían `fecha`, que es un DÍA (y encima puede ser un
-- día futuro, en un gasto programado tipo "pagar la renta el día 1"). Sin un
-- instante no había forma de partirlos por turno, así que el corte de la
-- tarde volvía a restar los gastos que el turno de la mañana ya había
-- entregado — el vendedor de la noche cuadraba dinero que no le tocaba.
--
-- Esto no era un descuido escondido: estaba escrito tal cual en
-- components/dashboards/abarrotes-cerrar-dia.tsx ("Los gastos SOLO guardan el
-- día, así que no se pueden partir entre dos turnos del mismo día"). Esta
-- migración quita esa limitación de raíz.
--
-- POR QUÉ EN DOS PASOS Y NO `add column ... default now()`
-- Un `add column` con un default VOLÁTIL como now() rellena TODAS las filas
-- que ya existen con el mismo instante: el de esta migración. O sea, todos
-- los gastos históricos del negocio quedarían marcados como "capturados
-- ahorita" y entrarían de golpe al turno en curso — exactamente el bug que
-- se quiere arreglar, pero peor. Se agrega la columna vacía (las filas
-- viejas quedan en NULL) y recién después se le pone el default para las
-- filas NUEVAS.
--
-- Un gasto con created_at NULL es un gasto de antes de esta migración:
-- gastoEnTurnoActual() (lib/turno.ts) lo sigue contando en el turno en
-- curso, igual que siempre. Es a propósito — hacer desaparecer gastos viejos
-- de un corte sería peor que contarlos de más — y se cura solo en cuanto
-- cambia el día.
--
-- Idempotente: se puede correr las veces que haga falta.

alter table fonda_gastos add column if not exists created_at timestamptz;
alter table fonda_gastos alter column created_at set default now();

alter table abarrotes_gastos add column if not exists created_at timestamptz;
alter table abarrotes_gastos alter column created_at set default now();

-- El dashboard y los dos wizards de cierre filtran por negocio + día + este
-- instante en cada render. Sin el índice es un scan de todos los gastos
-- históricos del negocio cada vez.
create index if not exists fonda_gastos_negocio_fecha_idx on fonda_gastos (negocio_id, fecha);
create index if not exists abarrotes_gastos_negocio_fecha_idx on abarrotes_gastos (negocio_id, fecha);

notify pgrst, 'reload schema';
