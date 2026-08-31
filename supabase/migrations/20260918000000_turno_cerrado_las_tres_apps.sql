-- El turno nuevo arranca en CERO, en las tres apps.
--
-- EL BUG
-- Owen: "cierro turno y tal, y vuelvo a iniciar sesión y cierro turno,
-- funciona pero tiene los mismos datos que se supone ya se cerraron, y pues
-- los cuenta para el siguiente cierre".
--
-- Tenía razón y la causa estaba a la vista: de los tres wizards de cierre,
-- solo el de Fondita sabe cuándo fue el último. Barbería y Abarrotera
-- filtran así:
--
--     data.citas.filter((c) => c.fecha === hoy && ...)
--     data.ventas.filter((v) => fechaCalendarioLocal(v.fecha) === hoy)
--
-- O sea: TODO el día, siempre, sin importar cuántos cierres hubo antes. El
-- segundo turno del día vuelve a contar lo del primero, y el vendedor de la
-- tarde queda cuadrando dinero que ya entregó el de la mañana.
--
-- Fondita no lo tenía porque a esa sí se le agregó `turno_fonda_cerrado_en`
-- en su momento. Esta migración generaliza esa idea a las tres.
--
-- POR QUÉ EL CORTE ES DEL NEGOCIO Y NO DE CADA PERSONA
-- El corte se compara contra el dinero que hay en el cajón, y el cajón es
-- uno solo. Si dos personas trabajan el mismo turno y comparten caja, no
-- existe forma de partir el efectivo físico entre las dos, así que "cada
-- quien cuenta lo suyo" nunca cuadraría contra lo que de verdad hay. Por eso
-- la marca es del negocio: el turno nuevo cuenta lo vendido después del
-- último cierre, lo haya hecho quien lo haya hecho. Quién cerró sí queda
-- registrado (empleado_nombre_cache), que es lo que el reporte de /app/cortes
-- necesita para señalar diferencias.

-- Columna genérica para los tres giros.
alter table negocios add column if not exists turno_cerrado_en timestamptz;

-- Fondita ya venía guardando su marca aparte: se copia para no perder el
-- turno en curso de ningún negocio al soltar este cambio. Sin esto, una
-- fonda que cerró hace media hora vería su siguiente corte arrancando desde
-- la medianoche otra vez — justo el bug que estamos cerrando.
--
-- `turno_fonda_cerrado_en` NO se borra: si algo sale mal, el dato viejo
-- sigue ahí para volver atrás.
update negocios
set turno_cerrado_en = turno_fonda_cerrado_en
where turno_cerrado_en is null and turno_fonda_cerrado_en is not null;

notify pgrst, 'reload schema';
