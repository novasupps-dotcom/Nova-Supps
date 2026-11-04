// 2.6 · Ajustes → Actualizar catálogo: descargar el catálogo en Excel, editarlo y volver a
// cargarlo (Excel .xlsx o CSV). Muestra los cambios antes de aplicarlos y guarda una
// copia de tus datos dentro de la app antes de tocar nada.
// 2.7 · Cada renglón se puede quitar, modificar o (si se repite, por ejemplo por sabor)
// unificar desde la app, y al cargar se pregunta si se suma la comisión de la terminal.
import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import { Alert, Switch, View } from "react-native";
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
import { Button, C, Card, Chips, Note, Pill, TextButton, s } from "../ui";

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

  function confirmApply() {
    if (!plan || !table) return;
    const { new: created, update, error: bad } = plan.counts;
    const summary = [
      created ? `${created} ${created === 1 ? "producto nuevo" : "productos nuevos"}` : "",
      update ? `${update} ${update === 1 ? "producto con cambios" : "productos con cambios"}` : "",
      bad ? `${bad} ${bad === 1 ? "renglón con error no se carga" : "renglones con error no se cargan"}` : "",
    ].filter(Boolean);
    const fee = plan.fee;
    if (fee.addFee && fee.priced) {
      const pct = feeLabel(fee.bps);
      Alert.alert(
        `¿Sumar la comisión de la terminal (${pct})?`,
        [
          `Los ${fee.priced} precios del archivo suben ${pct}` + (fee.example ? ` (ej. ${money(fee.example.from)} → ${money(fee.example.to)}).` : "."),
          fee.switching
            ? `Desde ahora el precio del catálogo ya incluye la comisión y al cobrar no se suma otra vez.` +
              (fee.others ? ` Los ${fee.others} productos sin precio en el archivo también suben ${pct}, así el cliente paga lo mismo que hoy.` : "")
            : "Tus precios ya incluyen la comisión: al cobrar no se suma otra vez.",
          ...summary,
          "Tus ventas y cobros anteriores no cambian. Antes se guarda una copia de tus datos.",
        ].join("\n\n"),
        [
          { text: "Cancelar", style: "cancel" },
          { text: "No sumar", onPress: () => void apply(planCatalogImport(b, table, { addFee: false })) },
          { text: "Sí, sumar y cargar", onPress: () => void apply(plan) },
        ],
      );
      return;
    }
    Alert.alert(
      "Actualizar catálogo",
      [...summary, "Tus ventas y cobros no cambian. Antes se guarda una copia de tus datos en la app."].join("\n"),
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Aplicar", onPress: () => void apply(plan) },
      ],
    );
  }

  async function apply(p: ImportPlan) {
    if (busy) return;
    setBusy("apply");
    setError("");
    try {
      await keepCopy(b);
      const r = applyCatalogImport(b, p);
      reset();
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
        <Note>
          Excel (.xlsx) o CSV. Primero verás qué cambia y podrás quitar, modificar o unificar renglones; nada se guarda
          hasta que toques «Aplicar».
        </Note>
        <View style={{ height: 8 }} />
        <Button
          title={busy === "read" ? "Leyendo archivo…" : table ? "Elegir otro archivo" : "Elegir archivo"}
          icon="upload"
          secondary={!!table}
          disabled={!!busy}
          onPress={pick}
        />
        {!!error && <Note color={C.red}>{error}</Note>}
      </Card>

      {table && !plan && (
        <Card>
          <Note color={C.red}>{planError}</Note>
          {!!history.length && <Button title="Deshacer último cambio" secondary small onPress={undo} />}
          <Button title="Descartar" secondary small onPress={reset} />
        </Card>
      )}

      {plan && (
        <>
          {plan.fee.bps > 0 && plan.fee.priced > 0 && (
            <Card>
              <View style={s.between}>
                <Text style={[s.body, { fontWeight: "600", flex: 1 }]}>
                  {`Sumar la comisión de la terminal (${feeLabel(plan.fee.bps)}) a los precios`}
                </Text>
                <Switch
                  value={addFee}
                  onValueChange={setAddFee}
                  accessibilityLabel="Sumar la comisión de la terminal a los precios"
                />
              </View>
              {addFee ? (
                <>
                  {!!plan.fee.example && (
                    <Note>{`Ej. ${money(plan.fee.example.from)} del archivo → ${money(plan.fee.example.to)} en el catálogo.`}</Note>
                  )}
                  <Note>
                    {plan.fee.switching
                      ? `El precio del catálogo incluirá la comisión y al cobrar ya no se sumará otra vez.${plan.fee.others ? ` Los ${plan.fee.others} productos sin precio en el archivo también suben, así el cliente paga lo mismo que hoy.` : ""}`
                      : "Tus precios ya incluyen la comisión: al cobrar no se suma otra vez."}
                  </Note>
                </>
              ) : (
                <Note color={inPrice ? C.amber : undefined}>
                  {inPrice
                    ? "Los precios se guardan tal como vienen y al cobrar no se suma comisión: usa esta opción solo si el archivo ya la incluye."
                    : "Los precios se guardan tal como vienen; la comisión se sigue sumando al cobrar."}
                </Note>
              )}
            </Card>
          )}

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
            {!!plan.counts.error && (
              <View style={{ marginTop: 6 }}>
                <Note>
                  {`Los renglones con error no se cargan. Puedes quitarlos, modificarlos${dups ? " o unificar los repetidos (mismo producto en varios renglones, por ejemplo por sabor)" : ""}.`}
                </Note>
                <View style={[s.row, { gap: 8, marginTop: 6 }]}>
                  {!!dups && (
                    <Button
                      title={`Unificar repetidos (${dups})`}
                      small
                      flex
                      onPress={() => change(mergeAllDuplicates(table!, plan), `${dups} ${dups === 1 ? "renglón unificado" : "renglones unificados"}`)}
                    />
                  )}
                  <Button
                    title={`Quitar errores (${plan.counts.error})`}
                    small
                    secondary
                    flex
                    onPress={() => change(dropAllErrors(table!, plan), "Renglones con error quitados")}
                  />
                </View>
              </View>
            )}
            {!!history.length && (
              <TextButton title={`Deshacer último cambio (${history.length})`} onPress={undo} />
            )}
            <Chips
              row
              options={(["Cambios", "Errores", "Sin cambios"] as View3[]).map((x) => ({ id: x, name: x }))}
              value={view}
              onChange={(v) => setView(v as View3)}
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
                {editing === r.line ? (
                  editor(r)
                ) : (
                  <View style={[s.row, { gap: 14 }]}>
                    {!!r.dupOf && (
                      <TextButton
                        title={`Unificar con renglón ${r.dupOf}`}
                        bold
                        onPress={() => change(mergeRows(table!, r.dupOf!, r.line), `Renglón ${r.line} unificado con el ${r.dupOf}`)}
                      />
                    )}
                    <TextButton title="Modificar" onPress={() => startEdit(r)} />
                    <TextButton
                      title="Quitar"
                      color={C.red}
                      onPress={() => change(dropRow(table!, r.line), `Renglón ${r.line} quitado de la carga`)}
                    />
                  </View>
                )}
              </View>
            ))}
            {rows.length > SHOW && <Note>{`…y ${rows.length - SHOW} más.`}</Note>}
            <View style={{ height: 8 }} />
            <Button
              title={busy === "apply" ? "Aplicando…" : pending ? `Aplicar ${pending} ${pending === 1 ? "cambio" : "cambios"}` : "No hay cambios que aplicar"}
              disabled={!pending || !!busy}
              onPress={confirmApply}
            />
            <Button title="Descartar" secondary disabled={!!busy} onPress={reset} />
          </Card>
        </>
      )}

      <Card>
        <Text style={s.subtitle}>Qué hace cada columna</Text>
        <Note>• SKU: identifica el producto. Si lo dejas vacío en un producto nuevo, la app lo crea. Nunca se cambia.</Note>
        <Note>• Celda vacía: no cambia nada. Para borrar un texto escribe un guion (-).</Note>
        <Note>• Precio: tu precio. Al cargar eliges si se le suma la comisión de la terminal.</Note>
        <Note>• Activo = No: deja de venderse y se oculta a tus vendedores (no se borra).</Note>
        <Note>• Existencias: cuántas piezas tienes; la app deja ese número. Si no lo cambias, se respeta lo vendido después de descargar el Excel.</Note>
        <Note>• Agregar piezas: suma piezas como un lote nuevo. Costo unitario y Caducidad aplican a las piezas que se suman. Nada mueve dinero.</Note>
        <Note>• Quitar: ese renglón no se carga (tu archivo no cambia). Unificar: junta renglones del mismo producto, suma existencias y junta los sabores.</Note>
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
