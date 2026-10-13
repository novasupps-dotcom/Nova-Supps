// 2.1 · Respaldo automático en la nube: estado, respaldar ahora y restaurar.
import React, { useEffect, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import type { Business } from "../business";
import type { Cloud } from "../cloud";
import {
  downloadBackup,
  KEEP_BACKUPS,
  listBackups,
  uploadBackup,
  type CloudBackup,
} from "../cloudBackup";
import { Button, C, Card, Note, Pill, s } from "../ui";

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
export const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : iso;
};

/**
 * Tarjeta de respaldo en la nube. `onRestore` recibe el JSON verificado: quien la usa
 * guarda una copia local previa y llama a `restore` (igual que con un archivo).
 */
export function CloudBackupCard({
  b,
  cloud,
  appVersion,
  device,
  onRestore,
}: {
  b: Business;
  cloud: Cloud | null;
  appVersion: string;
  device: string;
  onRestore: (raw: string, backup: CloudBackup) => Promise<void> | void;
}) {
  const [list, setList] = useState<CloudBackup[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "bad" } | null>(
    null,
  );
  const [auto, setAuto] = useState(
    b.setting("cloudBackupAuto", true) !== false,
  );
  const last = b.setting("cloudBackupLast", null) as {
    at?: string;
    bytes?: number;
  } | null;
  const err = b.setting("cloudBackupError", null) as {
    at?: string;
    text?: string;
  } | null;
  const load = async () => {
    if (!cloud?.session) return;
    try {
      setList(await listBackups(cloud));
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), tone: "bad" });
    }
  };
  useEffect(() => {
    void load();
  }, [cloud?.session?.access_token]);
  if (!cloud?.session)
    return (
      <Card>
        <Text style={s.subtitle}>☁️ Respaldo automático en la nube</Text>
        <Note>
          Conecta la base en línea (Parámetros → Vendedores) para guardar una
          copia diaria de tu negocio en la nube.
        </Note>
      </Card>
    );
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), tone: "bad" });
    } finally {
      setBusy("");
    }
  };
  return (
    <Card tone={last?.at ? "ok" : undefined}>
      <View style={s.between}>
        <Text style={[s.subtitle, { flex: 1 }]}>
          ☁️ Respaldo automático en la nube
        </Text>
        <Pill
          text={last?.at ? "Activo" : "Sin respaldo"}
          tone={last?.at ? "ok" : "warn"}
        />
      </View>
      <Note>{`Una copia al día de todo tu negocio (con fotos), comprimida y solo visible para ti. Se guardan las últimas ${KEEP_BACKUPS}. La clave de Mercado Pago y tu PIN no viajan.`}</Note>
      {!!last?.at && (
        <Note>{`Último respaldo: ${when(last.at)} · ${kb(last.bytes || 0)}`}</Note>
      )}
      {!!err?.text && (
        <Note
          color={C.red}
        >{`No se pudo respaldar (${when(err.at || "")}): ${err.text}`}</Note>
      )}
      <View style={s.between}>
        <Text style={[s.body, { flex: 1 }]}>Respaldar solo una vez al día</Text>
        <Switch
          accessibilityLabel="Respaldar solo una vez al día"
          value={auto}
          onValueChange={(v) => {
            setAuto(v);
            b.setSetting("cloudBackupAuto", v);
          }}
        />
      </View>
      <Button
        title={busy === "up" ? "Respaldando…" : "☁️ Respaldar ahora"}
        disabled={!!busy}
        onPress={() =>
          void run("up", async () => {
            const r = await uploadBackup(b, cloud, appVersion, device);
            b.setSetting("cloudBackupError", null);
            setMsg({
              text: `Respaldo guardado en la nube · ${kb(r.bytes)}`,
              tone: "ok",
            });
            await load();
          })
        }
      />
      {!!msg && (
        <Note color={msg.tone === "bad" ? C.red : C.green}>{msg.text}</Note>
      )}
      {list && list.length > 0 && (
        <Text style={[s.label, { marginTop: 8 }]}>Respaldos en la nube</Text>
      )}
      {(list || []).map((x, i) => (
        <View key={x.id} style={[s.between, { gap: 8, paddingVertical: 4 }]}>
          <Text
            style={[s.body, { flex: 1 }]}
          >{`${when(x.created_at)} · ${kb(x.bytes)}${i === 0 ? " · el más reciente" : ""}`}</Text>
          <Button
            title={busy === x.id ? "Restaurando…" : "Restaurar"}
            secondary
            small
            disabled={!!busy}
            onPress={() =>
              Alert.alert(
                "Restaurar respaldo",
                `Se reemplazarán los datos de este teléfono por los del ${when(x.created_at)}. Antes se guarda una copia de lo que tienes ahora.`,
                [
                  { text: "Volver", style: "cancel" },
                  {
                    text: "Restaurar",
                    style: "destructive",
                    onPress: () =>
                      void run(x.id, async () => {
                        const raw = await downloadBackup(cloud, x);
                        await onRestore(raw, x);
                        setMsg({
                          text: `Respaldo del ${when(x.created_at)} restaurado`,
                          tone: "ok",
                        });
                      }),
                  },
                ],
              )
            }
          />
        </View>
      ))}
      {list && !list.length && (
        <Note color={C.amber}>Aún no hay respaldos en la nube.</Note>
      )}
    </Card>
  );
}
