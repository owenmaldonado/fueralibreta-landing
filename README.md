# FUERA LIBRETA

Landing page para **fueralibreta.com** — sistemas para negocios de Tepic
(barberías, fondas y abarrotes). Next.js 14 (App Router) + TypeScript +
Tailwind CSS + shadcn/ui, con formulario de contacto conectado a Supabase.

## 1. Instalación local

```bash
npm install
cp .env.example .env.local
# edita .env.local con tus datos de Supabase
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

> El formulario funciona en pantalla aunque no configures Supabase (modo
> demo), pero no guardará nada. Configura las variables de entorno para
> guardar los mensajes de verdad.

## 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta:

```sql
create table if not exists contactos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  negocio text not null,
  mensaje text,
  created_at timestamptz not null default now()
);

alter table contactos enable row level security;

create policy "Cualquiera puede insertar contactos"
  on contactos for insert
  to anon
  with check (true);
```

Esta política solo permite **insertar** (no leer ni borrar) desde el
navegador, por seguridad. Para ver los mensajes entra a **Table Editor** en
el panel de Supabase con tu cuenta.

3. Copia la **URL** y la **anon key** del proyecto (Settings → API) a tu
   `.env.local` / variables de entorno de Vercel:

```
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU-ANON-KEY
```

## 3. Desplegar en Vercel

1. Sube este proyecto a un repositorio (GitHub, GitLab o Bitbucket).
2. Entra a [vercel.com/new](https://vercel.com/new) e importa el repo.
3. Framework preset: **Next.js** (detectado automático).
4. Agrega las variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` en **Settings → Environment Variables**.
5. Deploy. Luego conecta el dominio `fueralibreta.com` en **Settings →
   Domains**.

## Estructura

```
app/
  layout.tsx        # fuentes (Space Grotesk, Inter, JetBrains Mono) + metadata
  page.tsx           # landing completa (hero, servicios, demo/contacto)
  globals.css        # tokens de tema oscuro + texturas de "papel rayado"
components/
  contact-form.tsx   # formulario cliente, inserta en Supabase
  ui/                # button, card, input, textarea, label, badge (shadcn/ui)
lib/
  supabase.ts        # cliente de Supabase
  utils.ts           # helper cn()
```

## Personalizar

- **WhatsApp:** cambia el número en `app/page.tsx` (`https://wa.me/523110000000`).
- **Colores:** variables HSL en `app/globals.css` (`--primary` ámbar,
  `--ledger` verde, `--destructive` rojo del "tachón").
- **Textos:** todo el copy está en español dentro de `app/page.tsx`.

<!-- Deployment trigger: ensuring production deploys from main -->
