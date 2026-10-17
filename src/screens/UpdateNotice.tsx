import React, { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { Text } from "../text";
import type { Business } from "../business";
import { Button, C, Note, s } from "../ui";
import { checkForUpdates, restartForUpdate, shouldAutoApply, updateIsReady } from "../updates";

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
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const check = useRef(canRestart);
  check.current = canRestart;
  const flush = useRef(beforeRestart);
  flush.current = beforeRestart;
  useEffect(() => {
    let alive = true;
    // 2.5.3: desde cuándo la app está en segundo plano (para aplicar la versión nueva al volver).
    let backgroundSince: number | null = null;
    const run = () => {
      void checkForUpdates(b).then((result) => {
        if (alive) setReady(result);
      });
    };
    run();
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
      sub.remove();
    };
  }, [b]);
  if (!ready) return null;
  return (
    <View style={{ padding: 12, backgroundColor: C.goldSoft, borderBottomWidth: 1, borderColor: C.amberLine }}>
      <Text style={s.subtitle}>Versión nueva lista</Text>
      <Note>Se instala sola la próxima vez que abras la app; nunca a media venta.</Note>
      {!canRestart() && (
        <Note>Termina el cobro y cierra los formularios para instalarla ahora.</Note>
      )}
      {!!error && <Note color={C.red}>{error}</Note>}
      <Button
        title={busy ? "Instalando…" : "Instalar ahora"}
        small
        disabled={busy || !canRestart()}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await restartForUpdate(
              () => check.current(),
              () => flush.current?.(),
            );
          } catch {
            setError(
              "No se pudo reiniciar. Cierra y vuelve a abrir la app cuando termines el cobro.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}
