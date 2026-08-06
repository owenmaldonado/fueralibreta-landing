"use client";

// Placeholder mínimo: sin datos reales todavía, solo para que la tarjeta de
// Rentas en /app/admin-hub deje de mostrar "Próximamente". El módulo real
// (tabla propia, CRUD de propiedades) se construye aparte cuando se necesite.
export default function RentasPage() {
  return (
    <div className="p-10 text-white">
      <h1 className="text-3xl">Rentas - 0 propiedades</h1>
      <button className="mt-5 bg-yellow-500 text-black px-4 py-2 rounded">+ Nueva Propiedad</button>
    </div>
  );
}
