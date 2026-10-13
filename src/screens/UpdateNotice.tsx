import React, { useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import type { Business } from "../business";
import { Button, C, Note, s } from "../ui";
import { checkForUpdates, restartForUpdate, updateIsReady } from "../updates";

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
    const run = () => {
      void checkForUpdates(b).then((result) => {
        if (alive) setReady(result);
      });
    };
    run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [b]);
  if (!ready) return null;
  return (
    <View style={{ padding: 12, backgroundColor: "#e7f1e9" }}>
      <Text style={s.subtitle}>Actualización lista · Reiniciar</Text>
      {!canRestart() && (
        <Note>Termina el cobro y cierra los formularios para reiniciar.</Note>
      )}
      {!!error && <Note color={C.red}>{error}</Note>}
      <Button
        title={busy ? "Reiniciando…" : "Reiniciar"}
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
