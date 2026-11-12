// 2.11.3 · Stock → «Actualizar existencias (Excel)»: carga el Excel del conteo, muestra qué
// cambia y lo aplica en un solo paso. 2.11.4: reemplaza piezas y precio de venta.
import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-document-picker";
import React, { useState } from "react";
import { View } from "react-native";
import { Text } from "../text";
import { money, type Business } from "../business";
import { readCatalogFile } from "../catalogImport";
import { base64ToBytes } from "../photos";
import { applyStockImport, planStockImport, priceChanges, stockChanges, type StockImportPlan } from "../stockImport";
import { XLSX_MIME } from "../salesExcel";
import { Button, C, Card, Note, s } from "../ui";

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
      setPlan(planStockImport(b, table));
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
      notify(`Excel aplicado · ${r.stock} ${r.stock === 1 ? "existencia" : "existencias"} · ${r.price} ${r.price === 1 ? "precio" : "precios"}`);
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
          Usa el «Reporte de stock» con «Físicas» y «Precio de Venta» (o «Precio»). Las piezas y el precio de cada producto quedan exactamente como
          en el Excel: se reemplazan, no se suman, y no se crean productos nuevos. El costo de compra no cambia. No mueve dinero ni cuenta como merma.
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
          </Card>
          {plan.changes.map((r) => (
            <View key={r.line} style={[s.between, { paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: C.line, gap: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={2}>
                  {r.productName}
                </Text>
                <Note>{priceChanges(r) ? `Precio ${money(r.priceNow ?? 0)} → ${money(r.price ?? 0)}` : r.sku}</Note>
              </View>
              {stockChanges(r) && (
                <Text style={[s.body, { fontWeight: "700", color: r.target! > r.current ? C.green : C.red }]}>{`${r.current} → ${r.target} pzas`}</Text>
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
