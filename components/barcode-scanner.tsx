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
    // Evita pedirle stop() dos veces a la cámara (una al detectar el
    // código, otra al desmontar) — la segunda llamada rechaza la promesa
    // porque ya no está escaneando. clear() solo es seguro después de que
    // stop() de verdad terminó, así que ambas rutas comparten la misma
    // promesa en vez de dispararla dos veces.
    let stopped = false;
    let stopPromise: Promise<void> = Promise.resolve();

    function detenerCamara(): Promise<void> {
      if (!stopped && instance) {
        stopped = true;
        stopPromise = instance.stop().catch(() => {});
      }
      return stopPromise;
    }

    import("html5-qrcode")
      .then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
        if (cancelled) return;
        // El BarcodeDetector nativo (useBarCodeDetectorIfSupported) en
        // Android solo reconoce QR en la mayoría de los chips — no lee
        // CODE_128/EAN_13 de productos de abarrotera. Se fuerza el decoder
        // en JS con los formatos de barras reales que usa el negocio.
        const formats = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ];
        instance = new Html5Qrcode(scanId, { formatsToSupport: formats, verbose: false });
        return instance.start(
          { facingMode: "environment" },
          {
            fps: 12, // 12 es suficiente, 20 calienta
            qrbox: { width: 250, height: 150 }, // rectangular para barcode, no cuadrado, lee más rápido
            aspectRatio: 1.777, // 16:9 nativo, no fuerza al cel
            videoConstraints: {
              facingMode: "environment",
              width: { ideal: 1280 }, // 720p ideal, no 1080 — no calienta
              height: { ideal: 720 },
            },
            disableFlip: true,
          },
          (decodedText: string) => {
            console.log(decodedText);
            if (navigator.vibrate) navigator.vibrate(100);
            // Un código ya es suficiente: apaga la cámara de inmediato en
            // vez de esperar a que el padre desmonte este componente.
            detenerCamara();
            onScanRef.current(decodedText);
          },
          () => {}
        );
      })
      .catch(() => setError("No se pudo acceder a la cámara. Revisa los permisos del navegador."));

    return () => {
      cancelled = true;
      detenerCamara().then(() => instance?.clear());
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
        {/* 16:9 (aspectRatio: 1.777), igual que la resolución 720p ideal de
            la cámara — si el contenedor no coincide con esa proporción,
            html5-qrcode estira o recorta el <video> para llenarlo, que es
            justo la imagen "chueca y borrosa" que se reportó antes.
            object-fit: cover mantiene la imagen nítida y sin distorsión. */}
        <div id={scanId} className="relative aspect-video w-full max-w-sm overflow-hidden rounded-2xl bg-black" />
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
