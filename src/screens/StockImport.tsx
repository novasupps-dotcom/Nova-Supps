// 2.11.3 · Stock → «Actualizar existencias (Excel)»: carga el Excel del conteo, muestra qué
// cambia (y cuántas piezas se vendieron después del archivo) y lo aplica en un solo paso.
import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-document-picker";
import React, { useState } from "react";
import { View } from "react-native";
import { Text } from "../text";
import type { Business } from "../business";
import { readCatalogFile } from "../catalogImport";
import { base64ToBytes } from "../photos";
import { applyStockImport, fileDate, planStockImport, type StockImportPlan } from "../stockImport";
import { XLSX_MIME } from "../salesExcel";
import { Button, C, Card, Note, fmtDay, s } from "../ui";

const FILE_TYPES = [XLSX_MIME, "application/vnd.ms-excel", "text/csv", "application/octet-stream"];

export function StockImportPage({ b, notify, onChanged }: { b: Business; notify: (t: string) => void; onChanged: () => void }) {
  const [plan, setPlan] = useState<StockImportPlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

  async function pick() {
    setError("");
    try {
      const r = await Picker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.length) return;
      const asset = r.assets[0];
      setBusy("Leyendo el archivo…");
      await new Promise((ok) => setTimeout(ok, 30));
      const raw = await FS.readAsStringAsync(asset.uri, { encoding: FS.EncodingType.Base64 });
      const table = readCatalogFile(base64ToBytes(raw));
      setPlan(planStockImport(b, table, { since: fileDate(asset.name || "") }));
      setFileName(asset.name || "archivo");
    } catch (e) {
      setPlan(null);
      setError(errText(e));
    } finally {
      setBusy("");
    }
  }

  async function apply() {
    if (!plan || busy) return;
    setBusy("Aplicando…");
    try {
      // Copia de seguridad dentro de la app antes de tocar el inventario.
      if (FS.documentDirectory) await FS.writeAsStringAsync(FS.documentDirectory + `Nova-antes-de-existencias-${Date.now()}.json`, b.backup());
      const r = applyStockImport(b, plan);
      setPlan(null);
      onChanged();
      notify(`Existencias actualizadas · ${r.stock} ${r.stock === 1 ? "producto" : "productos"}${r.minimum ? ` · ${r.minimum} mínimos` : ""}`);
    } catch (e) {
      setError("No se aplicó ningún cambio: " + errText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Card>
        <Text style={s.subtitle}>Actualizar existencias desde Excel</Text>
        <Note>
          Usa el «Reporte de stock» con la columna «Físicas» ya contada (o cualquier Excel con «SKU» y «Físicas» / «Existencias»). Solo cambian las
          unidades físicas y el mínimo: precios y costos no se tocan. No mueve dinero ni cuenta como merma.
        </Note>
        <Button title={busy || (plan ? "Elegir otro archivo" : "Elegir archivo de Excel")} icon="file-spreadsheet" secondary={!!plan} disabled={!!busy} onPress={() => void pick()} />
        {!!error && <Note color={C.red}>{error}</Note>}
      </Card>
      {plan && (
        <>
          <Card tone={plan.changes.length ? "ok" : undefined}>
            <Text style={s.subtitle}>{fileName}</Text>
            <Note>
              {`${plan.rows.length} renglones · ${plan.changes.length} con cambios · ${plan.rows.length - plan.changes.length - plan.missing.length - plan.errors.length} iguales`}
              {plan.missing.length ? ` · ${plan.missing.length} sin producto` : ""}
              {plan.errors.length ? ` · ${plan.errors.length} con error` : ""}
            </Note>
            {plan.since && (
              <Note>{`Archivo del ${fmtDay(plan.since.slice(0, 10))}: se descuentan las piezas vendidas después.`}</Note>
            )}
          </Card>
          {plan.changes.map((r) => (
            <View key={r.line} style={[s.between, { paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: C.line, gap: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={2}>
                  {r.productName}
                </Text>
                <Note>
                  {[
                    r.soldAfter ? `${r.counted} contadas − ${r.soldAfter} vendidas después` : "",
                    r.minimum !== null && r.minimum !== r.minimumNow ? `mínimo ${r.minimumNow} → ${r.minimum}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || r.sku}
                </Note>
              </View>
              {r.target !== null && r.target !== r.current && (
                <Text style={[s.body, { fontWeight: "700", color: r.target > r.current ? C.green : C.red }]}>{`${r.current} → ${r.target}`}</Text>
              )}
            </View>
          ))}
          {!!plan.missing.length && (
            <Card tone="warn">
              <Text style={s.subtitle}>No están en la app</Text>
              {plan.missing.map((r) => (
                <Note key={r.line}>{`Renglón ${r.line}: ${r.sku || ""} ${r.name}`.trim()}</Note>
              ))}
            </Card>
          )}
          {!!plan.errors.length && (
            <Card tone="warn">
              <Text style={s.subtitle}>Con error (no se aplican)</Text>
              {plan.errors.map((r) => (
                <Note key={r.line} color={C.red}>{`Renglón ${r.line} · ${r.name || r.sku}: ${r.error}`}</Note>
              ))}
            </Card>
          )}
          <View style={{ height: 8 }} />
          <Button
            title={plan.changes.length ? `Aplicar ${plan.changes.length} ${plan.changes.length === 1 ? "cambio" : "cambios"}` : "Sin cambios por aplicar"}
            disabled={!plan.changes.length || !!busy}
            onPress={() => void apply()}
          />
        </>
      )}
    </>
  );
}
