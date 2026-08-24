'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-destructive/5 p-4">
      <div className="max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <AlertTriangle className="h-16 w-16 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Algo salió mal</h1>
          <p className="text-sm text-muted-foreground">
            Hubo un problema inesperado. Intenta de nuevo.
          </p>
        </div>

        <Button onClick={() => reset()} size="lg" className="w-full">
          Reintentar
        </Button>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4 rounded border border-destructive/20 bg-destructive/5 p-3 text-left">
            <summary className="cursor-pointer text-xs font-mono text-destructive">
              Detalles (dev)
            </summary>
            <pre className="mt-2 overflow-auto text-xs">
              {error.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
