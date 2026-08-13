import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { IMPERSONATION_COOKIE, readImpersonationCookie } from "@/lib/impersonation";

/** Le dice al shell si el navegador está en modo "ver como este usuario", para mostrar el banner de salida. La cookie es httpOnly, así que el cliente no puede leerla directo. */
export async function GET() {
  const payload = readImpersonationCookie(cookies().get(IMPERSONATION_COOKIE)?.value);
  if (!payload) return NextResponse.json({ impersonating: false });
  return NextResponse.json({
    impersonating: true,
    adminEmail: payload.adminEmail,
    targetEmail: payload.targetEmail,
  });
}
