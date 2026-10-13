import React, { useEffect, useState } from "react";
import { Linking, Text } from "react-native";
import type { Business } from "../business";
import type { Cloud } from "../cloud";
import {
  PUSH_TEXT,
  pushStatus,
  registerPush,
  unregisterPush,
  type PushState,
} from "../push";
import { Button, C, Card, Note, s } from "../ui";

export function PushCard({
  b,
  cloud,
  revision = 0,
  onChanged,
}: {
  b: Business;
  cloud: Cloud | null;
  revision?: number;
  onChanged?: () => void;
}) {
  const [state, setState] = useState<PushState>("inactive"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void pushStatus(b).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [b, cloud, revision]);
  const action = async (activate: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (activate) {
        if (!cloud?.session)
          throw new Error("Conecta primero tu cuenta para activar los avisos.");
        b.setSetting("pushAsked", true);
        const result = await registerPush(b, cloud, true);
        setState(result);
        b.setSetting("pushAttempt", {
          user: cloud.userId,
          url: cloud.cfg.url,
          at: Date.now(),
          state: result,
        });
      } else {
        await unregisterPush(b, cloud);
        setState("off");
      }
      onChanged?.();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron cambiar los avisos.",
      );
      setState(await pushStatus(b));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Text style={s.subtitle}>🔔 Avisos en este teléfono</Text>
      <Note>{PUSH_TEXT[state]}</Note>
      {state === "off" && b.setting("pushToken", null)?.token && (
        <Note color={C.amber}>
          Falta conexión para terminar de retirar este teléfono de los avisos de
          la tienda. Toca Desactivar cuando tengas internet.
        </Note>
      )}
      {!cloud?.session && (
        <Note>Conecta tu cuenta para recibir avisos de la tienda.</Note>
      )}
      {!!error && <Note color={C.red}>{error}</Note>}
      <Button
        title={busy ? "Guardando avisos…" : "Activar avisos"}
        secondary
        small
        disabled={
          busy ||
          !cloud?.session ||
          state === "unavailable" ||
          state === "no_project" ||
          state === "ok"
        }
        onPress={() => void action(true)}
      />
      <Button
        title="Desactivar avisos"
        secondary
        small
        disabled={
          busy || (state === "off" && !b.setting("pushToken", null)?.token)
        }
        onPress={() => void action(false)}
      />
      {state === "denied" && (
        <Button
          title="Abrir ajustes de avisos"
          secondary
          small
          onPress={() => void Linking.openSettings()}
        />
      )}
    </Card>
  );
}
