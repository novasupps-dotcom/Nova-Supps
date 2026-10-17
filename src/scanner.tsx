// 2.2.5 · Lector de códigos con la cámara: lee al instante (sin esperar 2.5 s), avisa con una
// vibración y muestra el resultado y las acciones en la misma pantalla, sin abrir otras
// ventanas encima. Lo que se hace después de cerrar (abrir un formulario) espera a que el
// lector termine de cerrarse.
import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Pressable, Vibration, View } from "react-native";
import { Text } from "./text";
import { SafeAreaView } from "react-native-safe-area-context";
import { isRetailCode, normalizeProductCode, sameProductCode } from "./barcodes";
import { cameraModule } from "./native";
import { C } from "./theme";

export const SCAN_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] as const;
/** Un código que sigue frente a la cámara no se vuelve a contar; si sale del cuadro este tiempo, sí. */
export const SCAN_REPEAT_MS = 1500;
/** Códigos sin dígito verificador (SKU en Code 128/39 o QR): dos lecturas iguales seguidas. */
export const SCAN_CONFIRM_MS = 800;

export type ScanAction = { label: string; onPress: () => void; primary?: boolean };
export type ScanResult = {
  text: string;
  bad?: boolean;
  /** Línea secundaria (precio, existencias, código leído). */
  detail?: string;
  action?: { label: string; onPress: () => void };
  actions?: ScanAction[];
  /** Cerrar el lector después de esta lectura. */
  done?: boolean;
};

/** Decide qué lecturas de la cámara cuentan (prueba unitaria en tests/scanner.cjs). */
export function createScanGate(clock = Date.now) {
  let accepted = "",
    acceptedSeen = -Infinity,
    pending = "",
    pendingAt = -Infinity;
  return {
    /** Devuelve el código a procesar, o "" si esta lectura no cuenta. */
    feed(raw: unknown): string {
      const code = normalizeProductCode(raw);
      const now = clock();
      if (!code || code.length > 80) return "";
      if (accepted && sameProductCode(code, accepted)) {
        const away = now - acceptedSeen;
        acceptedSeen = now;
        if (away < SCAN_REPEAT_MS) return "";
      }
      if (!isRetailCode(code)) {
        const confirmed = pending === code && now - pendingAt < SCAN_CONFIRM_MS;
        pending = code;
        pendingAt = now;
        if (!confirmed) return "";
      }
      pending = "";
      accepted = code;
      acceptedSeen = now;
      return code;
    },
    /** Permite contar otra vez el código que está frente a la cámara. */
    again() {
      accepted = "";
    },
    reset() {
      accepted = pending = "";
      acceptedSeen = pendingAt = -Infinity;
    },
  };
}

const vibrate = (bad?: boolean) => {
  try {
    Vibration.vibrate(bad ? [0, 60, 80, 60] : 40);
  } catch {}
};

function Btn({ label, onPress, primary, light, a11y }: { label: string; onPress: () => void; primary?: boolean; light?: boolean; a11y?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y || label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: light ? 0 : 1,
        minHeight: 48,
        paddingHorizontal: 14,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: primary ? C.brand : light ? "rgba(255,255,255,0.14)" : C.soft,
        borderWidth: primary || light ? 0 : 1,
        borderColor: C.line,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ color: primary || light ? "#fff" : C.ink, fontWeight: "700", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function CameraScanner(props: {
  visible: boolean;
  onClose: () => void;
  /**
   * `tools.close(después)` cierra el lector y, ya cerrado, ejecuta `después` (abrir un formulario).
   * `tools.update(resultado)` cambia lo que se muestra (por ejemplo, después de buscar en internet).
   */
  onScan: (code: string, tools: ScanTools) => ScanResult | Promise<ScanResult>;
  continuous?: boolean;
  instruction?: string;
  /** Se llama ya cerrado el lector (para abrir otro formulario sin encimar ventanas). */
  onClosed?: () => void;
}) {
  const pendingAfterClose = useRef<(() => void) | null>(null);
  const wasVisible = useRef(props.visible);
  useEffect(() => {
    if (wasVisible.current && !props.visible) {
      const next = pendingAfterClose.current;
      pendingAfterClose.current = null;
      // La animación de cierre de Android termina antes de abrir lo siguiente.
      const t = setTimeout(() => {
        next?.();
        props.onClosed?.();
      }, 350);
      wasVisible.current = props.visible;
      return () => clearTimeout(t);
    }
    wasVisible.current = props.visible;
  }, [props.visible]);
  if (!props.visible) return null;
  return <ScannerContent {...props} later={(fn) => (pendingAfterClose.current = fn)} />;
}

function ScannerContent({
  onClose,
  onScan,
  continuous = true,
  instruction,
  later,
}: Parameters<typeof CameraScanner>[0] & { later: (fn: () => void) => void }) {
  const camera = cameraModule();
  const [permission, setPermission] = useState<{ granted: boolean; canAskAgain?: boolean } | null>(null);
  const [active, setActive] = useState(AppState.currentState === "active" || AppState.currentState == null);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(ScanResult & { code: string }) | null>(null);
  const gate = useRef(createScanGate());
  const alive = useRef(true);
  const reading = useRef(false);
  const closing = useRef(false);
  const live = useRef({ onScan, continuous, onClose });
  live.current = { onScan, continuous, onClose };
  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    if (after) later(after);
    live.current.onClose();
  };
  useEffect(() => {
    alive.current = true;
    const load = () =>
      void camera?.Camera.getCameraPermissionsAsync()
        .then((p) => alive.current && setPermission(p))
        .catch(() => alive.current && setPermission({ granted: false }));
    load();
    const sub = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      gate.current.reset();
      if (state === "active") load();
    });
    return () => {
      alive.current = false;
      sub.remove();
    };
  }, []);
  const handle = async (code: string) => {
    reading.current = true;
    setBusy(true);
    try {
      const r = await live.current.onScan(code, {
        close,
        update: (next) => {
          if (!alive.current || closing.current) return;
          vibrate(next.bad);
          setResult({ ...next, code });
          if (next.done) close();
        },
      });
      if (!alive.current || closing.current) return;
      vibrate(r.bad);
      setResult({ ...r, code });
      if (r.done || (!live.current.continuous && !r.bad)) close();
    } catch {
      if (alive.current) setResult({ code, text: "No se pudo procesar el código. Vuelve a leerlo.", bad: true });
    } finally {
      reading.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const scanned = ({ data }: { data: string }) => {
    if (!alive.current || closing.current) return;
    const code = gate.current.feed(data);
    if (!code || reading.current) return;
    void handle(code);
  };
  const Camera = camera?.CameraView;
  const actions: ScanAction[] = [
    ...(result?.action ? [result.action] : []),
    ...(result?.actions || []).map((a) => ({
      ...a,
      onPress: () => {
        gate.current.again();
        a.onPress();
      },
    })),
  ];
  return (
    <Modal animationType="slide" visible onRequestClose={() => close()} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.dark }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
          <Text style={{ flex: 1, color: "#fff", fontSize: 20, fontWeight: "800" }} numberOfLines={1}>
            Lector
          </Text>
          {!!camera && permission?.granted && <Btn light label={torch ? "Luz ✓" : "Luz"} a11y={torch ? "Apagar linterna" : "Encender linterna"} onPress={() => setTorch(!torch)} />}
          <Btn light label="Cerrar" a11y="Cerrar lector" onPress={() => close()} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 16, borderRadius: 18, overflow: "hidden", backgroundColor: "#000" }}>
          {!camera ? (
            <Text style={{ color: "#fff", padding: 18 }}>El lector con cámara necesita la versión nativa de Android (2.2 o posterior).</Text>
          ) : !permission ? (
            <Text style={{ color: "#fff", padding: 18 }}>Revisando el permiso de la cámara…</Text>
          ) : !permission.granted ? (
            <View style={{ padding: 18, gap: 12 }}>
              <Text style={{ color: "#fff", fontSize: 16 }}>Permite usar la cámara para leer códigos.</Text>
              <Btn
                primary
                label={permission.canAskAgain === false ? "Abrir ajustes de cámara" : "Permitir cámara"}
                onPress={() => {
                  if (permission.canAskAgain === false) void Linking.openSettings();
                  else
                    void camera.Camera.requestCameraPermissionsAsync()
                      .then((p) => alive.current && setPermission(p))
                      .catch(() => {});
                }}
              />
            </View>
          ) : active && Camera ? (
            <>
              <Camera
                style={{ flex: 1 }}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: [...SCAN_TYPES] }}
                onBarcodeScanned={scanned}
                onMountError={() => alive.current && setResult({ code: "", text: "No se pudo iniciar la cámara. Cierra otras apps que la usen e intenta de nuevo.", bad: true })}
              />
              {/* Guía de encuadre */}
              <View pointerEvents="none" style={{ position: "absolute", left: "10%", right: "10%", top: "30%", height: "36%", borderWidth: 2.5, borderColor: "rgba(255,255,255,0.92)", borderRadius: 18 }} />
            </>
          ) : (
            <View style={{ flex: 1 }} />
          )}
        </View>
        <View style={{ backgroundColor: C.paper, margin: 16, borderRadius: 18, padding: 16, gap: 10 }}>
          {!result ? (
            <>
              <Text style={{ color: C.ink, fontSize: 16, fontWeight: "700" }}>
                {instruction || (continuous ? "Apunta al código de barras o al SKU." : "Apunta al código para leerlo.")}
              </Text>
              <Text style={{ color: C.muted, fontSize: 13.5 }}>Lee códigos de barras (EAN/UPC), Code 128, Code 39 y QR.</Text>
            </>
          ) : (
            <>
              <Text accessibilityLiveRegion="polite" style={{ color: result.bad ? C.red : C.green, fontSize: 17, fontWeight: "800" }}>
                {result.text}
              </Text>
              {!!(result.detail || result.code) && <Text style={{ color: C.muted, fontSize: 13.5 }}>{result.detail || `Código leído: ${result.code}`}</Text>}
            </>
          )}
          {busy && <Text style={{ color: C.muted }}>Buscando…</Text>}
          {actions.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {actions.map((a) => (
                <Btn key={a.label} label={a.label} primary={a.primary} onPress={a.onPress} />
              ))}
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** Para las acciones de un resultado: cerrar el lector y después hacer algo (abrir un formulario). */
export type ScannerCloser = (after?: () => void) => void;
export type ScanTools = { close: ScannerCloser; update: (result: ScanResult) => void };
