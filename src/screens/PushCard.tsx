import React, { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Text } from "../text";
import type { Business } from "../business";
import type { Cloud } from "../cloud";
import {
  PUSH_TEXT,
  pushStatus,
  registerPush,
  unregisterPush,
  enableLocalNotices,
  previewLocalNotice,
  type PushState,
} from "../push";
import { Button, C, Card, Note, s } from "../ui";

export function PushCard({
  b,
  cloud,
  revision = 0,
  onChanged,
  seller = false,
}: {
  b: Business;
  cloud: Cloud | null;
  revision?: number;
  onChanged?: () => void;
  seller?: boolean;
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
        b.setSetting("pushAsked", true);
        const local = await enableLocalNotices(b, true);
        if (local !== "local_only") {
          setState(local);
          return;
        }
        const result = cloud?.session
          ? await registerPush(b, cloud, true)
          : local;
        setState(result);
        b.setSetting("pushAttempt", {
          user: cloud?.userId,
          url: cloud?.cfg.url,
          device: cloud?.device,
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
  const [info, setInfo] = useState("");
  const remove = state === "off" && b.setting("pushToken", null)?.token;
  return (
    <Card>
      <Text style={s.subtitle}>Avisos en este teléfono</Text>
      <Note color={state === "ok" ? C.green : undefined}>
        {PUSH_TEXT[state]}
      </Note>
      <Note>
        {seller
          ? "Te avisa cuando el dueño rechaza una venta tuya."
          : "Tus ventas, ventas de vendedores, cierres y seguimientos (9:00)."}
      </Note>
      {remove && (
        <Note color={C.amber}>
          Falta internet para retirar este teléfono de los avisos. Toca
          Desactivar con conexión.
        </Note>
      )}
      {!cloud?.session && (
        <Note>Conecta tu cuenta para recibir avisos de la tienda.</Note>
      )}
      {!!error && <Note color={C.red}>{error}</Note>}
      {!!info && <Note color={C.green}>{info}</Note>}
      {!!b.setting("pushLocalError", null) && (
        <Note color={C.amber}>{b.setting("pushLocalError")}</Note>
      )}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Button
            title={
              busy
                ? "Guardando…"
                : state === "ok"
                  ? "Actualizar registro"
                  : "Activar avisos"
            }
            secondary
            small
            disabled={
              busy ||
              (seller && !cloud?.session) ||
              state === "unavailable" ||
              (seller && state === "no_project")
            }
            onPress={() => (setInfo(""), void action(true))}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Probar aviso"
            secondary
            small
            disabled={busy}
            onPress={() => {
              setBusy(true);
              setError("");
              setInfo("");
              void previewLocalNotice(b)
                .then(() =>
                  setInfo(
                    "Aviso de prueba enviado. Revisa tus notificaciones.",
                  ),
                )
                .catch((e) =>
                  setError(
                    e instanceof Error
                      ? e.message
                      : "No se pudo mostrar el aviso.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          />
        </View>
      </View>
      {((state !== "off" && state !== "inactive" && state !== "unavailable") ||
        remove) && (
        <Button
          title="Desactivar avisos"
          secondary
          small
          disabled={busy}
          onPress={() => (setInfo(""), void action(false))}
        />
      )}
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
