import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cameraModule } from "./native";

export const SCAN_TYPES = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "qr",
] as const;
export type ScanResult = { text: string; bad?: boolean };
export function createScanGate(clock = Date.now) {
  let code = "",
    seenAt = -Infinity;
  return {
    accept(raw: string) {
      const next = raw.trim(),
        now = clock();
      if (!next || next.length > 512) return false;
      const duplicate = next === code && now - seenAt < 1500;
      code = next;
      seenAt = now;
      return !duplicate;
    },
    reset() {
      code = "";
      seenAt = -Infinity;
    },
  };
}

const button = {
  padding: 14,
  borderRadius: 12,
  backgroundColor: "#e6eee7",
  marginVertical: 5,
};
const label = {
  color: "#163927",
  fontWeight: "700" as const,
  fontSize: 16,
  textAlign: "center" as const,
};

export function CameraScanner({
  visible,
  onClose,
  onScan,
  continuous = true,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => ScanResult | Promise<ScanResult>;
  continuous?: boolean;
}) {
  if (!visible) return null;
  return (
    <Modal animationType="slide" visible onRequestClose={onClose}>
      <ScannerContent
        onClose={onClose}
        onScan={onScan}
        continuous={continuous}
      />
    </Modal>
  );
}

function ScannerContent({
  onClose,
  onScan,
  continuous,
}: Omit<Parameters<typeof CameraScanner>[0], "visible">) {
  const [permission, setPermission] = useState<{
    granted: boolean;
    canAskAgain?: boolean;
  } | null>(null);
  const [message, setMessage] = useState<ScanResult | null>(null);
  const [active, setActive] = useState(
    AppState.currentState !== "background" &&
      AppState.currentState !== "inactive",
  );
  const [torch, setTorch] = useState(false);
  const gate = useRef(createScanGate());
  const reading = useRef(false);
  const alive = useRef(true);
  const camera = cameraModule();
  useEffect(() => {
    alive.current = true;
    void camera?.Camera.getCameraPermissionsAsync()
      .then((p) => {
        if (alive.current) setPermission(p);
      })
      .catch(() => {
        if (alive.current)
          setMessage({ text: "No se pudo abrir la cámara.", bad: true });
      });
    const sub = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state === "active")
        void camera?.Camera.getCameraPermissionsAsync()
          .then((p) => {
            if (alive.current) setPermission(p);
          })
          .catch(() => {});
    });
    return () => {
      alive.current = false;
      sub.remove();
    };
  }, []);
  const scan = async ({ data }: { data: string }) => {
    if (
      !alive.current ||
      !active ||
      reading.current ||
      !gate.current.accept(data)
    )
      return;
    reading.current = true;
    try {
      const result = await onScan(data.trim());
      if (alive.current) setMessage(result);
      if (!continuous && !result.bad) onClose();
    } catch {
      if (alive.current)
        setMessage({
          text: "No se pudo agregar. Intenta de nuevo.",
          bad: true,
        });
    } finally {
      reading.current = false;
    }
  };
  const Camera = camera?.CameraView;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", padding: 16 }}>
      <Text
        style={{
          fontSize: 24,
          fontWeight: "800",
          color: "#163927",
          marginBottom: 12,
        }}
      >
        Lector de códigos
      </Text>
      <Text style={{ fontSize: 16, marginBottom: 12 }}>
        {continuous
          ? "Apunta al código del producto para agregar una pieza."
          : "Apunta al código para guardarlo en el producto."}
      </Text>
      {!camera ? (
        <Text>
          El lector está disponible al instalar la nueva versión de Android.
        </Text>
      ) : !permission ? (
        <Text>Revisando permiso de cámara…</Text>
      ) : !permission.granted ? (
        <>
          <Text>Permite usar la cámara para leer códigos.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              permission.canAskAgain === false
                ? "Abrir ajustes de cámara"
                : "Permitir cámara"
            }
            style={button}
            onPress={() => {
              if (permission.canAskAgain === false) void Linking.openSettings();
              else
                void camera.Camera.requestCameraPermissionsAsync()
                  .then((p) => {
                    if (alive.current) setPermission(p);
                  })
                  .catch(() =>
                    setMessage({
                      text: "Activa la cámara en Ajustes → Nova Negocio.",
                      bad: true,
                    }),
                  );
            }}
          >
            <Text style={label}>
              {permission.canAskAgain === false
                ? "Abrir ajustes de cámara"
                : "Permitir cámara"}
            </Text>
          </Pressable>
        </>
      ) : active && Camera ? (
        <Camera
          style={{ flex: 1, minHeight: 180, borderRadius: 16 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...SCAN_TYPES] }}
          onBarcodeScanned={scan}
          onMountError={() =>
            setMessage({
              text: "No se pudo iniciar la cámara. Cierra otras apps que la usen e intenta de nuevo.",
              bad: true,
            })
          }
        />
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontSize: 17,
            fontWeight: "700",
            color: message.bad ? "#a12d2d" : "#267545",
            paddingVertical: 12,
          }}
        >
          {message.text}
        </Text>
      )}
      {!!camera && permission?.granted && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={torch ? "Apagar linterna" : "Encender linterna"}
          style={button}
          onPress={() => setTorch(!torch)}
        >
          <Text style={label}>
            {torch ? "Apagar linterna" : "Encender linterna"}
          </Text>
        </Pressable>
      )}
      {continuous && !!message && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escanear otra pieza del mismo producto"
          style={button}
          onPress={() => {
            gate.current.reset();
            setMessage(null);
          }}
        >
          <Text style={label}>Escanear otra pieza del mismo producto</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar lector"
        style={button}
        onPress={onClose}
      >
        <Text style={label}>Cerrar lector</Text>
      </Pressable>
    </SafeAreaView>
  );
}
