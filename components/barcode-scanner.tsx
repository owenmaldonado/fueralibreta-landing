"use client";

import * as React from "react";
import { Camera, X } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

/** Escáner de códigos de barras con la cámara, sin apps externas (html5-qrcode). */
export function BarcodeScanner({ onScan, onClose }: Props) {
  // Prefijo con letra: un id que arranca con dígito no es un selector CSS
  // válido para el <style> de abajo.
  const scanId = `bcs-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [error, setError] = React.useState<string | null>(null);
  const onScanRef = React.useRef(onScan);
  onScanRef.current = onScan;

  React.useEffect(() => {
    let cancelled = false;
    let instance: Html5Qrcode | null = null;

    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;
        instance = new Html5Qrcode(scanId);
        return instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText: string) => {
            if (navigator.vibrate) navigator.vibrate(100);
            onScanRef.current(decodedText);
          },
          () => {}
        );
      })
      .catch(() => setError("No se pudo acceder a la cámara. Revisa los permisos del navegador."));

    return () => {
      cancelled = true;
      if (instance) {
        instance
          .stop()
          .then(() => instance?.clear())
          .catch(() => {});
      }
    };
  }, [scanId]);

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-white">
          <Camera className="h-4 w-4" /> Apunta al código de barras
        </p>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-white hover:bg-white/10" aria-label="Cerrar">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-4">
        {/* Contenedor cuadrado: si no coincide con el aspect-ratio real de la
            cámara, html5-qrcode estira o recorta el <video> para llenarlo —
            de ahí la imagen "chueca y borrosa" que se reportó. Cuadrado +
            object-fit: cover mantiene la imagen nítida y sin distorsión. */}
        <div id={scanId} className="relative aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black" />
      </div>
      {error && <p className="bg-destructive/90 p-4 text-center text-sm text-white">{error}</p>}
      <style>{`
        #${scanId} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          transform: none !important;
        }
      `}</style>
    </div>
  );
}
