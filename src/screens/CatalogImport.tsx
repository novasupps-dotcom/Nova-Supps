// 2.6 · Ajustes → Actualizar catálogo: descargar el catálogo en Excel, editarlo y volver a
// cargarlo (Excel .xlsx o CSV). Muestra los cambios antes de aplicarlos y guarda una
// copia de tus datos dentro de la app antes de tocar nada.
import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Alert, View } from "react-native";
import { Text } from "../text";
import type { Business } from "../business";
import {
  applyCatalogImport,
  catalogWorkbook,
  planCatalogImport,
  readCatalogFile,
  type ImportPlan,
  type PlanRow,
} from "../catalogImport";
import { base64ToBytes } from "../photos";
import { XLSX_MIME } from "../salesExcel";
import { base64 } from "../xlsx";
import { Button, C, Card, Chips, Note, Pill, s } from "../ui";

const FILE_TYPES = [
  XLSX_MIME,
  "text/csv",
  "text/comma-separated-values",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream",
];
const SHOW = 60;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function CatalogImportPage({
  b,
  notify,
  onChanged,
}: {
  b: Business;
  notify: (text: string) => void;
  /** Se llama después de aplicar: refresca pantallas y publica el catálogo a los vendedores. */
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<"" | "download" | "read" | "apply">("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"Cambios" | "Errores" | "Sin cambios">("Cambios");

  async function download() {
    setBusy("download");
    setError("");
    try {
      const { bytes, fileName: name, count } = catalogWorkbook(b);
      const uri = FS.documentDirectory + name;
      await FS.writeAsStringAsync(uri, base64(bytes), { encoding: FS.EncodingType.Base64 });
      if (!(await Sharing.isAvailableAsync())) throw new Error("No se pudo abrir el menú para compartir.");
      await Sharing.shareAsync(uri, {
        mimeType: XLSX_MIME,
        dialogTitle: "Guardar catálogo en Excel",
        UTI: "org.openxmlformats.spreadsheetml.sheet",
      });
      notify(`Catálogo en Excel · ${count} productos`);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }

  async function pick() {
    setError("");
    try {
      const r = await Picker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.length) return;
      const asset = r.assets[0];
      setBusy("read");
      // Deja pintar «Leyendo…» antes del trabajo pesado.
      await new Promise((ok) => setTimeout(ok, 30));
      const raw = await FS.readAsStringAsync(asset.uri, { encoding: FS.EncodingType.Base64 });
      const next = planCatalogImport(b, readCatalogFile(base64ToBytes(raw)));
      setPlan(next);
      setFileName(asset.name || "archivo");
      setView(next.counts.new + next.counts.update ? "Cambios" : next.counts.error ? "Errores" : "Sin cambios");
    } catch (e) {
      setPlan(null);
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }

  function confirmApply() {
    if (!plan) return;
    const { new: created, update, error: bad } = plan.counts;
    Alert.alert(
      "Actualizar catálogo",
      [
        created ? `${created} ${created === 1 ? "producto nuevo" : "productos nuevos"}` : "",
        update ? `${update} ${update === 1 ? "producto con cambios" : "productos con cambios"}` : "",
        bad ? `${bad} ${bad === 1 ? "renglón con error se omite" : "renglones con error se omiten"}` : "",
        "Tus ventas y cobros no cambian. Antes se guarda una copia de tus datos en la app.",
      ]
        .filter(Boolean)
        .join("\n"),
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Aplicar", onPress: () => void apply() },
      ],
    );
  }

  async function apply() {
    if (!plan || busy) return;
    setBusy("apply");
    setError("");
    try {
      await keepCopy(b);
      const r = applyCatalogImport(b, plan);
      setPlan(null);
      setFileName("");
      onChanged();
      notify(
        `Catálogo actualizado · ${r.created} nuevos · ${r.updated} con cambios` +
          (r.counted ? ` · existencias de ${r.counted}` : "") +
          (r.units ? ` · +${r.units} piezas` : ""),
      );
    } catch (e) {
      setError("No se aplicó ningún cambio: " + errText(e));
    } finally {
      setBusy("");
    }
  }

  const rows: PlanRow[] = plan
    ? plan.rows.filter((r) =>
        view === "Errores" ? r.kind === "error" : view === "Sin cambios" ? r.kind === "same" : r.kind === "new" || r.kind === "update",
      )
    : [];
  const pending = plan ? plan.counts.new + plan.counts.update : 0;

  return (
    <>
      <Card>
        <Text style={s.subtitle}>1. Descarga tu catálogo</Text>
        <Note>
          Excel con todos tus productos: SKU, nombre, categoría, precio, código de barras, marca y más. Ábrelo en la
          computadora, Google Sheets o Excel del teléfono y cambia lo que necesites. Para un producto nuevo agrega un
          renglón con Nombre y Precio.
        </Note>
        <View style={{ height: 8 }} />
        <Button
          title={busy === "download" ? "Preparando…" : "Descargar catálogo en Excel"}
          icon="download"
          secondary
          disabled={!!busy}
          onPress={download}
        />
      </Card>

      <Card>
        <Text style={s.subtitle}>2. Carga el archivo con tus cambios</Text>
        <Note>Excel (.xlsx) o CSV. Primero verás qué cambia; nada se guarda hasta que toques «Aplicar».</Note>
        <View style={{ height: 8 }} />
        <Button
          title={busy === "read" ? "Leyendo archivo…" : plan ? "Elegir otro archivo" : "Elegir archivo"}
          icon="upload"
          secondary={!!plan}
          disabled={!!busy}
          onPress={pick}
        />
        {!!error && <Note color={C.red}>{error}</Note>}
      </Card>

      {plan && (
        <Card>
          <Text style={s.subtitle} numberOfLines={1}>
            {fileName}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 }}>
            <Pill text={`${plan.counts.new} nuevos`} tone={plan.counts.new ? "ok" : "neutral"} />
            <Pill text={`${plan.counts.update} con cambios`} tone={plan.counts.update ? "ok" : "neutral"} />
            <Pill text={`${plan.counts.same} sin cambios`} />
            {!!plan.counts.error && <Pill text={`${plan.counts.error} con error`} tone="bad" />}
          </View>
          <Note>{`Columnas leídas: ${plan.columns.join(", ")}.`}</Note>
          {plan.notes.map((n, i) => (
            <Note key={i} color={C.amber}>
              {n}
            </Note>
          ))}
          <Chips
            row
            options={["Cambios", "Errores", "Sin cambios"].map((x) => ({ id: x, name: x }))}
            value={view}
            onChange={(v) => setView(v as typeof view)}
          />
          {!rows.length && <Note>Nada en esta lista.</Note>}
          {rows.slice(0, SHOW).map((r) => (
            <View key={r.line} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: C.line }}>
              <Text style={s.body} numberOfLines={1}>
                <Text style={{ fontWeight: "600" }}>{r.name || r.sku || "Sin nombre"}</Text>
                {r.sku ? <Text style={{ color: C.muted }}>{"  " + r.sku}</Text> : null}
              </Text>
              {r.kind === "error" ? (
                <Note color={C.red}>{`Renglón ${r.line}: ${r.error}`}</Note>
              ) : r.kind === "same" ? (
                <Note>{`Renglón ${r.line}: igual que en la app`}</Note>
              ) : (
                r.changes.map((c, i) => (
                  <Note key={i}>
                    {r.kind === "new" ? (i ? `${c.label}: ${c.to}` : `Nuevo: ${c.to}`) : `${c.label}: ${c.from || "—"} → ${c.to || "(vacío)"}`}
                  </Note>
                ))
              )}
              {!!r.warning && r.kind !== "error" && <Note color={C.amber}>{r.warning}</Note>}
            </View>
          ))}
          {rows.length > SHOW && <Note>{`…y ${rows.length - SHOW} más.`}</Note>}
          <View style={{ height: 8 }} />
          <Button
            title={busy === "apply" ? "Aplicando…" : pending ? `Aplicar ${pending} ${pending === 1 ? "cambio" : "cambios"}` : "No hay cambios que aplicar"}
            disabled={!pending || !!busy}
            onPress={confirmApply}
          />
          <Button title="Descartar" secondary disabled={!!busy} onPress={() => setPlan(null)} />
        </Card>
      )}

      <Card>
        <Text style={s.subtitle}>Qué hace cada columna</Text>
        <Note>• SKU: identifica el producto. Si lo dejas vacío en un producto nuevo, la app lo crea. Nunca se cambia.</Note>
        <Note>• Celda vacía: no cambia nada. Para borrar un texto escribe un guion (-).</Note>
        <Note>• Activo = No: deja de venderse y se oculta a tus vendedores (no se borra).</Note>
        <Note>• Existencias: cuántas piezas tienes; la app deja ese número. Si no lo cambias, se respeta lo vendido después de descargar el Excel.</Note>
        <Note>• Agregar piezas: suma piezas como un lote nuevo. Costo unitario y Caducidad aplican a las piezas que se suman. Nada mueve dinero.</Note>
      </Card>
    </>
  );
}

/** Copia de los datos antes de aplicar (se conservan las últimas 3, como en Respaldo). */
async function keepCopy(b: Business) {
  const dir = FS.documentDirectory;
  if (!dir) return;
  await FS.writeAsStringAsync(dir + `Nova-antes-de-catalogo-${Date.now()}.json`, b.backup());
  try {
    const old = (await FS.readDirectoryAsync(dir)).filter((n: string) => n.startsWith("Nova-antes-de-catalogo-")).sort();
    for (const name of old.slice(0, Math.max(0, old.length - 3))) await FS.deleteAsync(dir + name, { idempotent: true });
  } catch {}
}
