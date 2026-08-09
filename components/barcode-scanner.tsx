"use client";

import * as React from "react";
import { Camera, X } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

// Chrome expone focusMode en MediaTrackCapabilities/MediaTrackConstraintSet
// como extensión no estándar — el DOM lib de TS no la declara, así que se
// amplía aquí en vez de castear todo a `any`.
interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
  focusMode?: string[];
}
interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  focusMode?: string;
}
interface ExtendedVideoConstraints extends MediaTrackConstraints {
  focusMode?: ConstrainDOMString;
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
        const videoConstraints: ExtendedVideoConstraints = {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          focusMode: { ideal: "continuous" },
        };
        const started = instance.start(
          { facingMode: "environment" },
          {
            // Sin qrbox: con recuadro, html5-qrcode recorta y reescala el
            // frame antes de decodificar, y ese downscale es lo que
            // borronea el código de barras. El recuadro que ve el usuario
            // ahora es puramente visual (el <div> de abajo), la librería
            // siempre lee el video completo a su resolución nativa.
            fps: 15,
            videoConstraints: videoConstraints as MediaTrackConstraints,
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
        return started.then(() => {
          if (cancelled || !instance) return;
          // El zoom digital (aunque sea 1.x) recorta y reescala el frame en
          // el propio hardware, dejando el mismo blur que qrbox causaba en
          // software — por eso solo se toca el foco, nunca el zoom.
          const capabilities = instance.getRunningTrackCapabilities() as ExtendedTrackCapabilities;
          if (capabilities.focusMode?.includes("continuous")) {
            const advanced: ExtendedConstraintSet[] = [{ focusMode: "continuous" }];
            instance.applyVideoConstraints({ advanced } as MediaTrackConstraints).catch(() => {});
          }
        });
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
        {/* html5-qrcode toma dueño exclusivo del DOM dentro de #scanId
            (inyecta su propio <video>), así que el recuadro guía vive en un
            <div> hermano dentro de este contenedor "relative", no dentro
            de #scanId — si no, la librería lo borra en cuanto renderiza. */}
        <div className="relative h-[300px] w-full max-w-sm overflow-hidden rounded-2xl bg-black">
          <div id={scanId} className="absolute inset-0" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[40%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/90">
            <span className="absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-xl border-l-4 border-t-4 border-white" />
            <span className="absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-xl border-r-4 border-t-4 border-white" />
            <span className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-xl border-b-4 border-l-4 border-white" />
            <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-xl border-b-4 border-r-4 border-white" />
          </div>
        </div>
      </div>
      {error && <p className="bg-destructive/90 p-4 text-center text-sm text-white">{error}</p>}
      <style>{`
        #${scanId} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          filter: none !important;
          transform: none !important;
        }
      `}</style>
    </div>
  );
}
