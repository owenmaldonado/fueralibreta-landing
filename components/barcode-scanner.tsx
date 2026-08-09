"use client";

import * as React from "react";
import { Camera, X } from "lucide-react";
import type { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

const FORMATS = ["ean_13", "ean_8", "code_128", "upc_a", "code_39"];

// BarcodeDetector (Shape Detection API) todavía no está en el DOM lib de
// TS — es soporte experimental (Chrome/Android), no estándar en todos los
// navegadores. Se declara el shape mínimo que se usa en vez de castear a
// `any` en cada línea.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

/**
 * Escáner de códigos de barras: usa el BarcodeDetector nativo del navegador
 * cuando existe (rápido, sin librería), y cae a html5-qrcode si no.
 */
export function BarcodeScanner({ onScan, onClose }: Props) {
  const regionId = React.useId().replace(/[:]/g, "");
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [useNative, setUseNative] = React.useState<boolean | null>(null);
  const onScanRef = React.useRef(onScan);
  onScanRef.current = onScan;

  React.useEffect(() => {
    const ctor = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    setUseNative(!!ctor);
  }, []);

  // Camino nativo: BarcodeDetector sobre un <video> propio, sin librería.
  React.useEffect(() => {
    if (useNative !== true) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let scanned = false;

    const ctor = (window as typeof window & { BarcodeDetector: BarcodeDetectorConstructor }).BarcodeDetector;
    const detector = new ctor({ formats: FORMATS });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        video.play().catch(() => {});
        intervalId = setInterval(async () => {
          if (scanned || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]) {
              scanned = true;
              onScanRef.current(codes[0].rawValue);
            }
          } catch {
            // El video todavía no tiene un frame listo; se reintenta en el próximo tick.
          }
        }, 150);
      })
      .catch(() => setError("No se pudo acceder a la cámara. Revisa los permisos del navegador."));

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [useNative]);

  // Fallback: html5-qrcode, sin qrbox ni zoom, solo video a pantalla completa.
  React.useEffect(() => {
    if (useNative !== false) return;
    let cancelled = false;
    let instance: Html5Qrcode | null = null;

    import("html5-qrcode")
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;
        instance = new Html5Qrcode(regionId);
        return instance.start(
          { facingMode: "environment" },
          { fps: 10, videoConstraints: { facingMode: "environment" } },
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
  }, [useNative, regionId]);

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
      <div className="relative flex-1">
        {useNative ? (
          <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div id={regionId} className="h-full w-full" />
        )}
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-white"
          style={{ top: "50%", left: "50%", width: "70%", height: "30%", transform: "translate(-50%, -50%)" }}
        />
      </div>
      {error && <p className="bg-destructive/90 p-4 text-center text-sm text-white">{error}</p>}
    </div>
  );
}
