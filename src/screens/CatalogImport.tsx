// 2.6 · Ajustes → Actualizar catálogo: descargar el catálogo en Excel, editarlo y volver a
// cargarlo (Excel .xlsx o CSV). Muestra los cambios antes de aplicarlos y guarda una
// copia de tus datos dentro de la app antes de tocar nada.
// 2.7 · Cada renglón se puede quitar, modificar o (si se repite, por ejemplo por sabor)
// unificar desde la app, y al cargar se pregunta si se suma la comisión de la terminal.
import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Text, TextInput } from "../text";
import { feeLabel, money, type Business } from "../business";
import {
  EDITABLE,
  applyCatalogImport,
  catalogWorkbook,
  dropAllErrors,
  dropRow,
  editRow,
  fieldLabel,
  mergeAllDuplicates,
  mergeRows,
  planCatalogImport,
  readCatalogFile,
  rowFields,
  type Cell,
  type Field,
  type ImportPlan,
  type PlanRow,
} from "../catalogImport";
import { base64ToBytes } from "../photos";
import { XLSX_MIME } from "../salesExcel";
import { base64 } from "../xlsx";
import { Button, C, Card, Chips, Note, Steps, TextButton, s } from "../ui";

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
type View3 = "Cambios" | "Errores" | "Sin cambios";
const NUMERIC: Field[] = ["price", "stock", "cost"];

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
  const [table, setTable] = useState<Cell[][] | null>(null);
  const [history, setHistory] = useState<Cell[][][]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<"" | "download" | "read" | "apply">("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View3>("Cambios");
  const [addFee, setAddFee] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
  // 2.8.1: tres pasos (archivo → revisar → aplicar).
  const [step, setStep] = useState(0);

  // El plan se recalcula con cada arreglo (quitar, modificar, unificar) o al cambiar la comisión.
  const { plan, planError } = useMemo(() => {
    if (!table) return { plan: null as ImportPlan | null, planError: "" };
    try {
      return { plan: planCatalogImport(b, table, { addFee }), planError: "" };
    } catch (e) {
      return { plan: null, planError: errText(e) };
    }
  }, [b, table, addFee]);

  function change(next: Cell[][], message?: string) {
    if (table) setHistory((h) => [...h.slice(-19), table]);
    setTable(next);
    setEditing(null);
    if (message) notify(message);
  }
  function undo() {
    if (!history.length) return;
    setTable(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setEditing(null);
  }
  function reset() {
    setTable(null);
    setHistory([]);
    setFileName("");
    setEditing(null);
  }

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
      const next = readCatalogFile(base64ToBytes(raw));
      const first = planCatalogImport(b, next, { addFee }); // valida encabezados antes de mostrar
      setTable(next);
      setHistory([]);
      setEditing(null);
      setFileName(asset.name || "archivo");
      setStep(1);
      setView(first.counts.error ? "Errores" : first.counts.new + first.counts.update ? "Cambios" : "Sin cambios");
    } catch (e) {
      reset();
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }

  function startEdit(r: PlanRow) {
    if (!table) return;
    setDraft(rowFields(table, r.line));
    setEditing(r.line);
  }
  function saveEdit() {
    if (!table || editing === null) return;
    change(editRow(table, editing, draft), `Renglón ${editing} modificado`);
  }

  async function apply(p: ImportPlan) {
    if (busy) return;
    setBusy("apply");
    setError("");
    try {
      await keepCopy(b);
      const r = applyCatalogImport(b, p);
      reset();
      setStep(0);
      onChanged();
      notify(
        `Catálogo actualizado · ${r.created} nuevos · ${r.updated} con cambios` +
          (r.counted ? ` · existencias de ${r.counted}` : "") +
          (r.units ? ` · +${r.units} piezas` : "") +
          (p.fee.addFee && p.fee.priced ? ` · precios + ${feeLabel(p.fee.bps)}` : ""),
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
  const dups = plan ? plan.rows.filter((r) => r.kind === "error" && r.dupOf).length : 0;
  const inPrice = b.feeInPrice();

  const editor = (r: PlanRow) => (
    <View style={{ marginTop: 6, gap: 6 }}>
      {EDITABLE.map((f) => (
        <View key={f}>
          <Text style={[s.muted, { fontSize: 13 }]}>{fieldLabel(f)}</Text>
          <TextInput
            style={s.input}
            value={draft[f] ?? ""}
            onChangeText={(t) => setDraft((d) => ({ ...d, [f]: t }))}
            keyboardType={NUMERIC.includes(f) ? "decimal-pad" : "default"}
            accessibilityLabel={`${fieldLabel(f)} del renglón ${r.line}`}
            autoCapitalize={f === "sku" ? "characters" : "sentences"}
          />
        </View>
      ))}
      <View style={[s.row, { gap: 8 }]}>
        <Button title="Guardar renglón" small flex onPress={saveEdit} />
        <Button title="Cancelar" small secondary flex onPress={() => setEditing(null)} />
      </View>
    </View>
  );

  // ---------------- 1. Archivo
  if (step === 0 || !table)
    return (
      <>
        <Steps step={0} names={["Archivo", "Revisar", "Aplicar"]} />
        <Card>
          <Text style={s.subtitle}>Tu catálogo en Excel</Text>
          <Note>Cámbialo y vuelve a cargarlo (.xlsx o CSV).</Note>
          <View style={{ height: 8 }} />
          <Button title={busy === "read" ? "Leyendo…" : "Elegir archivo"} icon="upload" disabled={!!busy} onPress={pick} />
          <TextButton title={busy === "download" ? "Preparando…" : "Descargar mi catálogo"} onPress={() => void download()} disabled={!!busy} />
          {!!error && <Note color={C.red}>{error}</Note>}
        </Card>
      </>
    );

  if (!plan)
    return (
      <>
        <Steps step={1} names={["Archivo", "Revisar", "Aplicar"]} />
        <Card>
          <Note color={C.red}>{planError}</Note>
          {!!history.length && <Button title="Deshacer" secondary small onPress={undo} />}
          <Button title="Cancelar" secondary small onPress={() => (reset(), setStep(0))} />
        </Card>
      </>
    );

  // ---------------- 2. Revisar
  if (step === 1)
    return (
      <>
        <Steps step={1} names={["Archivo", "Revisar", "Aplicar"]} />
        <Card>
          <View style={s.between}>
            <Text style={[s.body, { fontWeight: "600", flex: 1 }]} numberOfLines={1}>
              {fileName}
            </Text>
            {!!history.length && <TextButton title="Deshacer" onPress={undo} />}
          </View>
          <Chips
            row
            options={[
              { id: "Cambios", name: `Cambios ${plan.counts.new + plan.counts.update}` },
              { id: "Errores", name: `Errores ${plan.counts.error}` },
              { id: "Sin cambios", name: `Iguales ${plan.counts.same}` },
            ]}
            value={view}
            onChange={(v) => setView(v as View3)}
          />
          {view === "Errores" && !!plan.counts.error && (
            <View style={[s.row, { gap: 8 }]}>
              {!!dups && (
                <Button
                  title={`Unificar repetidos (${dups})`}
                  small
                  flex
                  onPress={() => change(mergeAllDuplicates(table, plan), `${dups} unificados`)}
                />
              )}
              <Button title="Quitar errores" small secondary flex onPress={() => change(dropAllErrors(table, plan), "Errores quitados")} />
            </View>
          )}
          {!rows.length && <Note>Nada aquí.</Note>}
          {rows.slice(0, SHOW).map((r) => (
            <View key={r.line} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: C.line }}>
              <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={1}>
                {r.name || r.sku || "Sin nombre"}
              </Text>
              <Text style={[s.muted, { fontSize: 12.5, color: r.kind === "error" ? C.red : C.muted }]} numberOfLines={2}>
                {r.kind === "error"
                  ? r.error
                  : r.kind === "same"
                    ? "Igual que en la app"
                    : r.changes
                        .map((c, i) => (r.kind === "new" ? (i ? `${c.label} ${c.to}` : `Nuevo · ${c.to}`) : `${c.label}: ${c.from || "—"} → ${c.to || "—"}`))
                        .join(" · ")}
              </Text>
              {editing === r.line ? (
                editor(r)
              ) : (
                <View style={[s.row, { gap: 14, marginVertical: 0 }]}>
                  {!!r.dupOf && (
                    <TextButton
                      title={`Unificar con ${r.dupOf}`}
                      bold
                      onPress={() => change(mergeRows(table, r.dupOf!, r.line), `Renglón ${r.line} unificado`)}
                    />
                  )}
                  <TextButton title="Modificar" onPress={() => startEdit(r)} />
                  <TextButton title="Quitar" color={C.red} onPress={() => change(dropRow(table, r.line), `Renglón ${r.line} quitado`)} />
                </View>
              )}
            </View>
          ))}
          {rows.length > SHOW && <Note>{`…y ${rows.length - SHOW} más.`}</Note>}
        </Card>
        <Button title="Continuar" disabled={!pending} onPress={() => setStep(2)} />
        <Button title="Cancelar" secondary onPress={() => (reset(), setStep(0))} />
      </>
    );

  // ---------------- 3. Aplicar
  const fee = plan.fee;
  return (
    <>
      <Steps step={2} names={["Archivo", "Revisar", "Aplicar"]} />
      <Card>
        <Text style={s.subtitle}>{`${pending} ${pending === 1 ? "cambio" : "cambios"}`}</Text>
        <Text style={[s.muted, { fontSize: 13 }]}>
          {[
            `${plan.counts.new} nuevos`,
            `${plan.counts.update} actualizados`,
            plan.counts.error ? `${plan.counts.error} con error no se cargan` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </Card>
      {fee.bps > 0 && fee.priced > 0 && (
        <Card>
          <Text style={s.subtitle}>{`Terminal ${feeLabel(fee.bps)}`}</Text>
          <Chips
            options={[
              { id: "add", name: "Sumarla a los precios" },
              { id: "as-is", name: "Precios tal cual" },
            ]}
            value={addFee ? "add" : "as-is"}
            onChange={(v) => setAddFee(v === "add")}
          />
          <Text style={[s.muted, { fontSize: 12.5 }]}>
            {addFee
              ? `${fee.example ? `${money(fee.example.from)} → ${money(fee.example.to)}. ` : ""}Al cobrar ya no se suma.`
              : inPrice
                ? "Usa esto solo si el archivo ya la incluye."
                : "La comisión se suma al cobrar."}
          </Text>
        </Card>
      )}
      {!!error && <Note color={C.red}>{error}</Note>}
      <Button title={busy === "apply" ? "Aplicando…" : "Aplicar"} disabled={!pending || !!busy} onPress={() => void apply(plan)} />
      <Button title="Atrás" secondary disabled={!!busy} onPress={() => setStep(1)} />
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
