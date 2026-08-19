-- "Frutas y Verdura" (GroceryProduct.isVolatile) nunca se guardaba en la
-- base: la columna no existía y lib/data.ts no la mapeaba en ningún
-- sentido, así que al refrescar la página los productos volvían sin la
-- bandera y desaparecían del filtro de app/app/frutas-verdura/page.tsx.
alter table abarrotes_productos add column if not exists is_volatile boolean not null default false;
notify pgrst, 'reload schema';
