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
  const regionId = React.useId().replace(/[:]/g, "");
  const [error, setError] = React.useState<string | null>(null);
  const onScanRef = React.useRef(onScan);
  onScanRef.current = onScan;

  React.useEffect(() => {
    let cancelled = false;
    let instance: Html5Qrcode | null = null;

    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;
        instance = new Html5Qrcode(regionId);
        return instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 150 } },
          (decodedText: string) => onScanRef.current(decodedText),
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
  }, [regionId]);

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
      <div id={regionId} className="mx-auto w-full max-w-sm flex-1" />
      {error && <p className="bg-destructive/90 p-4 text-center text-sm text-white">{error}</p>}
    </div>
  );
}
