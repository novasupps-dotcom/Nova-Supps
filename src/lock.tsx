// Bloqueo opcional con huella o rostro (como en la 1.1.1): si el teléfono tiene
// biometría registrada y está activa, se pide al abrir la app y con "Bloquear
// ahora". Sin PIN propio: la seguridad de las cuentas la dan los códigos que
// genera el dueño y la cuenta ligada a cada teléfono.
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import type { Business } from "./business";
import { LOGO_HEADER, LOGO_HEADER_RATIO } from "./brand";
import { s, Button, Note } from "./ui";

type LockApi = { lockNow: () => void; bioAvailable: boolean; bioEnabled: boolean; setBio: (on: boolean) => Promise<boolean> };
const LockCtx = createContext<LockApi>({ lockNow() {}, bioAvailable: false, bioEnabled: false, setBio: async () => false });
export const useLock = () => useContext(LockCtx);

export function LockGate({ b, children }: { b: Business; role?: "owner" | "seller"; children: React.ReactNode }) {
  const skip = !!(globalThis as any).__NOVA_SKIP_LOCK;
  const [state, setState] = useState<"checking" | "locked" | "open">(skip ? "open" : "checking");
  const [msg, setMsg] = useState("Verificando la seguridad del teléfono…");
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(b.setting("biometricEnabled", true) !== false);
  const busy = useRef(false);

  async function prompt(message: string) {
    if (busy.current) return false;
    busy.current = true;
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: message, biometricsSecurityLevel: "weak", disableDeviceFallback: false });
      return !!r?.success;
    } catch {
      return false;
    } finally {
      busy.current = false;
    }
  }
  async function unlock() {
    if (await prompt("Desbloquear Nova Negocio")) {
      setMsg("");
      setState("open");
    } else setMsg("No se autorizó el acceso. Toca para intentar de nuevo.");
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      let ok = false;
      try {
        ok = !!((await LocalAuthentication.hasHardwareAsync?.()) && (await LocalAuthentication.isEnrolledAsync?.()));
      } catch {}
      if (!alive) return;
      setBioAvailable(ok);
      if (skip) return;
      if (ok && bioEnabled) {
        setState("locked");
        void unlock();
      } else setState("open");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const api: LockApi = {
    lockNow: () => {
      if (bioAvailable && bioEnabled && !skip) {
        setMsg("");
        setState("locked");
      }
    },
    bioAvailable,
    bioEnabled,
    setBio: async (on: boolean) => {
      if (!(await prompt(on ? "Activar huella o rostro" : "Desactivar huella o rostro"))) return false;
      b.setSetting("biometricEnabled", on);
      setBioEnabled(on);
      return true;
    },
  };
  if (state === "open") return <LockCtx.Provider value={api}>{children}</LockCtx.Provider>;
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={[s.content, { flexGrow: 1, justifyContent: "center" }]}>
        <Image source={LOGO_HEADER} accessibilityLabel="GNS · Nova Negocio" resizeMode="contain" style={{ width: 280, height: 280 / LOGO_HEADER_RATIO, marginBottom: 28 }} />
        <Text style={{ fontSize: 30, marginBottom: 8 }}>🔒</Text>
        <Text style={s.title}>Nova Negocio está protegido</Text>
        {!!msg && <Note>{msg}</Note>}
        <View style={{ height: 16 }} />
        {state === "locked" && <Button title="Desbloquear con huella o rostro" onPress={() => void unlock()} />}
      </ScrollView>
    </SafeAreaView>
  );
}
