// 2.1 · Reportes por producto, por vendedor y de promociones.
import React, { useMemo, useState } from "react";
import { Share, Text, View } from "react-native";
import { money, type Business } from "../business";
import { salesReport, type SalesReport } from "../reports";
import { EXPORT_PERIODS, exportRange, type ExportPeriod } from "../salesExcel";
import { Button, C, Card, Chips, Note, s } from "../ui";

const SORTS = [
  { id: "revenue", name: "Más vendidos ($)" },
  { id: "units", name: "Más piezas" },
  { id: "profit", name: "Más ganancia" },
] as const;
type Sort = (typeof SORTS)[number]["id"];
const pct = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "—";

/** Texto del reporte para compartir por WhatsApp o correo. */
export function reportText(r: SalesReport, period: string): string {
  const out = [
    `*Reporte de ventas · ${period}*`,
    `${r.totals.sales} ventas · ${r.totals.units} piezas · ${money(r.totals.revenue)} (tu precio)`,
    `Ganancia estimada: ${money(r.totals.profit)}`,
    "",
    "*Por producto*",
  ];
  for (const p of r.products.slice(0, 20))
    out.push(
      `${p.name}: ${p.units} pzas · ${money(p.revenue)} · gana ${money(p.profit)}`,
    );
  if (r.products.length > 20)
    out.push(`… y ${r.products.length - 20} productos más`);
  out.push("", "*Por vendedor*");
  for (const x of r.sellers)
    out.push(
      `${x.seller}: ${x.sales} ventas · ${x.units} pzas · ${money(x.revenue)}`,
    );
  if (r.promos.length) {
    out.push("", "*Promociones*");
    for (const x of r.promos)
      out.push(`${x.name}: ${x.sales} ventas · −${money(x.amount)}`);
  }
  return out.join("\n");
}

export function ReportsPage({ b, version }: { b: Business; version: number }) {
  const [period, setPeriod] = useState<ExportPeriod>("Este mes");
  const [sort, setSort] = useState<Sort>("revenue");
  const [all, setAll] = useState(false);
  const report = useMemo(
    () => salesReport(b, exportRange(period)),
    [b, period, version],
  );
  const products = useMemo(
    () =>
      [...report.products].sort(
        (x, y) => y[sort] - x[sort] || y.revenue - x.revenue,
      ),
    [report, sort],
  );
  const shown = all ? products : products.slice(0, 15);
  const t = report.totals;
  const row = (label: string, value: string, sub?: string, color?: string) => (
    <View key={label} style={[s.between, { gap: 8, paddingVertical: 4 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.body}>{label}</Text>
        {!!sub && <Note>{sub}</Note>}
      </View>
      <Text style={[s.body, { fontWeight: "700" }, color ? { color } : null]}>
        {value}
      </Text>
    </View>
  );
  return (
    <>
      <Chips
        options={EXPORT_PERIODS.map((p) => ({ id: p, name: p }))}
        value={period}
        onChange={(v) => setPeriod(v as ExportPeriod)}
      />
      <Card tone="ok">
        <Text
          style={s.subtitle}
        >{`${t.sales} ${t.sales === 1 ? "venta" : "ventas"} · ${t.units} piezas`}</Text>
        {row("Tus ventas (tu precio)", money(t.revenue))}
        {row(
          "Cobrado a clientes",
          money(t.charged),
          "Incluye la comisión que absorbe el cliente",
        )}
        {row("Costo de la mercancía", money(t.cost))}
        {row(
          "Ganancia estimada",
          money(t.profit),
          `Margen ${pct(t.profit, t.revenue)}`,
          t.profit >= 0 ? C.green : C.red,
        )}
        {t.discount > 0 &&
          row(
            "Descuentos por promociones",
            "−" + money(t.discount),
            undefined,
            C.red,
          )}
      </Card>
      {!t.sales && <Note color={C.amber}>No hay ventas en este periodo.</Note>}
      {!!t.sales && (
        <>
          <Text style={s.section}>Por producto</Text>
          <Chips
            options={SORTS.map((x) => ({ id: x.id, name: x.name }))}
            value={sort}
            onChange={(v) => setSort(v as Sort)}
          />
          <Card>
            {shown.map((p, i) =>
              row(
                `${i + 1}. ${p.name}`,
                sort === "units"
                  ? `${p.units} pzas`
                  : money(sort === "profit" ? p.profit : p.revenue),
                `${p.units} pzas · ${p.sales} ${p.sales === 1 ? "venta" : "ventas"} · ${money(p.revenue)} · gana ${money(p.profit)} (${pct(p.profit, p.revenue)})${p.discount ? ` · promo −${money(p.discount)}` : ""}`,
              ),
            )}
            {products.length > 15 && (
              <Button
                title={
                  all
                    ? "Ver solo los 15 primeros"
                    : `Ver los ${products.length} productos`
                }
                secondary
                small
                onPress={() => setAll(!all)}
              />
            )}
          </Card>
          <Text style={s.section}>Por vendedor</Text>
          <Card>
            {report.sellers.map((x) =>
              row(
                x.seller,
                money(x.revenue),
                `${x.sales} ${x.sales === 1 ? "venta" : "ventas"} · ${x.units} pzas · ${pct(x.revenue, t.revenue)} del total · gana ${money(x.profit)}`,
              ),
            )}
          </Card>
          {!!report.promos.length && (
            <>
              <Text style={s.section}>Promociones</Text>
              <Card>
                {report.promos.map((x) =>
                  row(
                    x.name,
                    "−" + money(x.amount),
                    `${x.sales} ${x.sales === 1 ? "venta" : "ventas"}`,
                    C.red,
                  ),
                )}
              </Card>
            </>
          )}
          <Button
            title="📤 Compartir reporte"
            secondary
            onPress={() =>
              void Share.share({ message: reportText(report, period) }).catch(
                () => {},
              )
            }
          />
          <Note>
            El detalle venta por venta está en el Excel (Parámetros → Respaldo y
            Excel), que ahora también trae las hojas «Por producto» y «Por
            vendedor».
          </Note>
        </>
      )}
    </>
  );
}
