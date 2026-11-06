import React, { useEffect, useRef, useState } from "react";
import { Alert, AppState, Pressable, View } from "react-native";
import { Text } from "../text";
import type { Business } from "../business";
import { notifyUpdateReady } from "../push";
import { Button, C, Card, Icon, Note, s } from "../ui";
import {
  POLL_INTERVAL,
  checkForUpdates,
  onUpdateReady,
  readyUpdate,
  restartForUpdate,
  shouldAutoApply,
  updateDiagnostics,
  updateIsReady,
  type ReadyUpdate,
  type UpdateStatus,
} from "../updates";

/**
 * Busca versiones nuevas y, cuando una se descarga, avisa con:
 * - una ventana emergente «Nueva versión lista» con «Instalar ahora» / «Después» (2.7.1),
 * - una notificación del teléfono (si las notificaciones de Nova Negocio están permitidas),
 * - y esta franja arriba de la pantalla mientras no se instale.
 * Nunca reinicia a media venta o cobro.
 */
export function UpdateNotice({
  b,
  canRestart,
  beforeRestart,
}: {
  b: Business;
  canRestart: () => boolean;
  beforeRestart?: () => void;
}) {
  const [ready, setReady] = useState(updateIsReady()),
    [dismissed, setDismissed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const check = useRef(canRestart);
  check.current = canRestart;
  const flush = useRef(beforeRestart);
  flush.current = beforeRestart;

  const install = async () => {
    setBusy(true);
    setError("");
    try {
      const done = await restartForUpdate(
        () => check.current(),
        () => flush.current?.(),
      );
      if (!done) setError("Termina el cobro y cierra los formularios para instalarla.");
    } catch {
      setError("No se pudo reiniciar. Cierra y vuelve a abrir la app cuando termines el cobro.");
    } finally {
      setBusy(false);
    }
  };
  const installRef = useRef(install);
  installRef.current = install;

  useEffect(() => {
    let alive = true;
    // 2.7.1: ventana emergente y notificación, una vez por versión descargada.
    const announce = (u: ReadyUpdate) => {
      if (!alive) return;
      setReady(true);
      setDismissed(false);
      void notifyUpdateReady(b, u);
      if (b.setting("updatePopupFor", "") === u.id) return;
      try {
        b.setSetting("updatePopupFor", u.id);
      } catch {}
      const name = u.version ? `Nova Negocio ${u.version}` : "Una versión nueva de Nova Negocio";
      if (check.current())
        Alert.alert(
          "Nueva versión lista",
          `${name} ya se descargó. ¿La instalas ahora? Tarda unos segundos y tus datos no cambian.`,
          [
            { text: "Después", style: "cancel", onPress: () => setDismissed(true) },
            { text: "Instalar ahora", onPress: () => void installRef.current() },
          ],
        );
      else
        Alert.alert(
          "Nueva versión lista",
          `${name} ya se descargó. Se instala cuando termines el cobro o al volver a abrir la app.`,
        );
    };
    const off = onUpdateReady(announce);
    const pending = readyUpdate();
    if (pending) announce(pending);
    // 2.5.3: desde cuándo la app está en segundo plano (para aplicar la versión nueva al volver).
    let backgroundSince: number | null = null;
    const run = () => {
      void checkForUpdates(b).then((result) => {
        if (alive && result) setReady(true);
      });
    };
    run();
    const timer = setInterval(() => {
      if (AppState.currentState === undefined || AppState.currentState === "active") run();
    }, POLL_INTERVAL);
    // En Node (pruebas) el temporizador no debe mantener vivo el proceso; en el teléfono no aplica.
    (timer as unknown as { unref?: () => void })?.unref?.();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        if (backgroundSince === null) backgroundSince = Date.now();
        return;
      }
      if (state !== "active") return;
      const since = backgroundSince;
      backgroundSince = null;
      if (shouldAutoApply(updateIsReady(), since, Date.now(), () => check.current())) {
        void restartForUpdate(
          () => check.current(),
          () => flush.current?.(),
        ).catch(() => {});
        return;
      }
      run();
    });
    return () => {
      alive = false;
      off();
      clearInterval(timer);
      sub.remove();
    };
  }, [b]);
  if (!ready || dismissed) return null;
  const v = readyUpdate()?.version;
  return (
    <View
      style={{
        marginHorizontal: 18,
        marginTop: 6,
        marginBottom: 2,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: C.goldSoft,
        borderWidth: 1,
        borderColor: C.amberLine,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.subtitle, { fontSize: 14.5, marginBottom: 0 }]}>
          {v ? `Versión nueva lista · ${v}` : "Versión nueva lista"}
        </Text>
        {!canRestart() && <Note>Termina el cobro para instalarla.</Note>}
        {!!error && <Note color={C.red}>{error}</Note>}
      </View>
      <Button
        title={busy ? "Instalando…" : "Instalar ahora"}
        small
        disabled={busy || !canRestart()}
        onPress={() => void install()}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ocultar aviso de actualización"
        hitSlop={8}
        onPress={() => setDismissed(true)}
        style={{ padding: 4 }}
      >
        <Icon name="x" size={18} color={C.muted} />
      </Pressable>
    </View>
  );
}

/** 2.7.1 · Ajustes / Cuenta → Actualizaciones: versión instalada, buscar ahora y estado. */
export function UpdatesCard({
  b,
  version,
  notify,
}: {
  b: Business;
  version: string;
  notify: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const st = b.setting("updateStatus", null) as UpdateStatus | null;
  const d = updateDiagnostics();
  const when = (ms: number) =>
    new Date(ms).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const lastText = !st
    ? "Aún no se ha buscado en este teléfono."
    : st.result === "nueva"
      ? `${when(st.at)} · versión nueva descargada${st.detail ? " (" + st.detail + ")" : ""}`
      : st.result === "al-dia"
        ? `${when(st.at)} · ya tienes la más reciente`
        : st.result === "desactivadas"
          ? `${when(st.at)} · ${st.detail || "actualizaciones desactivadas"}`
          : `${when(st.at)} · no se pudo revisar (${st.detail || "sin conexión"})`;
  const search = async () => {
    setBusy(true);
    try {
      const found = await checkForUpdates(b, Date.now(), true);
      const now = b.setting("updateStatus", null) as UpdateStatus | null;
      if (!found)
        notify(
          now?.result === "error"
            ? "No se pudo revisar. Revisa tu internet e intenta de nuevo."
            : now?.result === "desactivadas"
              ? "Esta instalación no recibe actualizaciones automáticas."
              : "Ya tienes la versión más reciente",
        );
    } finally {
      setBusy(false);
      setTick((t) => t + 1);
    }
  };
  return (
    <Card>
      <View style={s.between}>
        <Text style={[s.body, { fontWeight: "600", flex: 1 }]}>Actualizaciones</Text>
        <Text style={s.price}>{version}</Text>
      </View>
      <Note>{`Última revisión: ${lastText}`}</Note>
      <Note>
        {updateIsReady()
          ? "Hay una versión nueva lista: toca «Instalar ahora» arriba."
          : "La app revisa sola al abrirla, al volver a ella y cada 10 minutos, y te avisa cuando hay una versión nueva."}
      </Note>
      <Button
        title={busy ? "Buscando…" : "Buscar actualización ahora"}
        icon="refresh-cw"
        secondary
        small
        disabled={busy}
        onPress={() => void search()}
      />
      <Text style={[s.muted, { fontSize: 11.5, marginTop: 4 }]}>
        {d.enabled
          ? `Canal ${d.channel || "—"} · runtime ${d.runtime || "—"} · ${d.embedded ? "versión del APK" : "versión descargada"}${d.updateId ? " " + d.updateId.slice(0, 8) : ""}${d.createdAt ? " · " + when(Date.parse(d.createdAt)) : ""}`
          : "Actualizaciones automáticas no disponibles en esta instalación."}
      </Text>
    </Card>
  );
}
