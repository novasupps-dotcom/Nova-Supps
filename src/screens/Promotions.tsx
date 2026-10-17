// 2.1 · Promociones por parámetro (pantalla del dueño). Se aplican solas al vender,
// en tu teléfono y en el de los vendedores (el servidor hace el mismo cálculo).
import React, { useMemo, useState } from "react";
import { Alert, Switch, View } from "react-native";
import { Text, TextInput } from "../text";
import {
  money,
  PROMO_KINDS,
  promoLive,
  promoTag,
  saleSegment,
  segmentsOf,
  today,
  type Business,
  type Promo,
  type Row,
} from "../business";
import { NEEDS_SCHEMA_21, SCHEMA_21_NOTE } from "../sync";
import {
  Button,
  C,
  Card,
  Chips,
  DateField,
  Note,
  Pill,
  QUICK_CAMPAIGN,
  s,
  SearchBox,
} from "../ui";

type Draft = {
  id?: string;
  name: string;
  kind: Promo["kind"];
  target: Promo["target"];
  ref: string;
  n: string;
  m: string;
  minQty: string;
  percent: string;
  from: string;
  to: string;
  active: boolean;
};
const EMPTY: Draft = {
  name: "",
  kind: "nxm",
  target: "all",
  ref: "",
  n: "2",
  m: "1",
  minQty: "3",
  percent: "10",
  from: "",
  to: "",
  active: true,
};
const toDraft = (p: Promo): Draft => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  target: p.target,
  ref: p.ref || "",
  n: String(p.n ?? 2),
  m: String(p.m ?? 1),
  minQty: String(p.minQty ?? 3),
  percent: String(p.percent ?? 10),
  from: p.from || "",
  to: p.to || "",
  active: p.active,
});
/** "Todo el catálogo", "Categoría Creatinas" o el nombre del producto. */
export function promoTarget(p: Promo, products: Row[]): string {
  if (p.target === "segment") return `Categoría ${p.ref}`;
  if (p.target === "product")
    return products.find((x) => x.id === p.ref)?.name || "Producto archivado";
  return "Todo el catálogo";
}
/** Ejemplo concreto para que se entienda la promoción antes de guardarla. */
function example(d: Draft, price: number): string {
  if (d.kind === "nxm") {
    const n = Number(d.n),
      m = Number(d.m);
    if (!(n >= 2 && m >= 1 && m < n)) return "";
    return `Ejemplo con ${money(price)}: el cliente lleva ${n} y paga ${m} → descuento de ${money((n - m) * price)} (en tu precio).`;
  }
  const pct = Number(d.percent);
  if (!(pct >= 1 && pct <= 90)) return "";
  if (d.kind === "volume")
    return `Ejemplo con ${money(price)}: desde ${d.minQty} piezas, ${pct}% menos en ese producto.`;
  return `Ejemplo con ${money(price)}: ${money(Math.round((price * pct) / 100))} de descuento por pieza.`;
}

/** Productos que con la promoción quedarían debajo de su costo (precio efectivo por pieza). */
export function belowCost(
  d: Draft,
  products: Row[],
): { name: string; cost: number; unit: number }[] {
  const n = Number(d.n),
    m = Number(d.m),
    pct = Number(d.percent);
  const factor =
    d.kind === "nxm"
      ? n >= 2 && m >= 1 && m < n
        ? m / n
        : 1
      : pct >= 1 && pct <= 90
        ? 1 - pct / 100
        : 1;
  if (factor >= 1) return [];
  return products
    .filter(
      (p) =>
        !p.archived &&
        p.stock > 0 &&
        (d.target === "all" ||
          (d.target === "segment" ? saleSegment(p) === d.ref : p.id === d.ref)),
    )
    .map((p) => ({
      name: String(p.name),
      cost: Math.round(Number(p.value) / Number(p.stock)),
      unit: Math.round(Number(p.price) * factor),
    }))
    .filter((x) => x.cost > 0 && x.unit < x.cost);
}

export function PromotionsPage({
  b,
  products,
  onChanged,
  notify,
}: {
  b: Business;
  products: Row[];
  onChanged: () => void;
  notify: (t: string) => void;
}) {
  const [edit, setEdit] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [find, setFind] = useState("");
  const [version, setVersion] = useState(0);
  const promos = useMemo(() => b.promos(), [b, version]);
  const segments = useMemo(() => segmentsOf(products), [products]);
  const day = today();
  const changed = (msg: string) => {
    setVersion((v) => v + 1);
    onChanged();
    notify(msg);
  };
  const save = () => {
    if (!edit) return;
    try {
      b.savePromo({
        ...edit,
        n: Number(edit.n),
        m: Number(edit.m),
        minQty: Number(edit.minQty),
        percent: Number(edit.percent),
        ref: edit.target === "all" ? undefined : edit.ref,
      });
      setEdit(null);
      setErr("");
      changed(edit.id ? "Promoción actualizada" : "Promoción creada");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const field = (
    key: "name" | "n" | "m" | "minQty" | "percent",
    label: string,
    numeric = true,
  ) => (
    <View style={s.field} key={key}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={edit![key]}
        onChangeText={(v) => setEdit((x) => (x ? { ...x, [key]: v } : x))}
        keyboardType={numeric ? "number-pad" : "default"}
        placeholderTextColor={C.muted}
      />
    </View>
  );
  const sample =
    edit?.target === "product"
      ? products.find((p) => p.id === edit.ref)
      : products.find(
          (p) =>
            !p.archived &&
            (!edit?.ref ||
              (edit.target === "segment" ? saleSegment(p) === edit.ref : true)),
        );
  const matches =
    find.trim().length >= 2
      ? products
          .filter(
            (p) =>
              !p.archived &&
              `${p.name} ${p.sku || ""}`
                .toLowerCase()
                .includes(find.trim().toLowerCase()),
          )
          .slice(0, 8)
      : [];
  return (
    <>
      {b.setting(NEEDS_SCHEMA_21, null) === true && (
        <Note color={C.amber}>{SCHEMA_21_NOTE}</Note>
      )}
      <Note>Se aplican solas al vender (también a tus vendedores). Si aplican varias, gana la de mayor descuento. Un precio especial en la venta tiene prioridad.</Note>
      {promos.map((p) => {
        const live = promoLive(p, day);
        return (
          <Card key={p.id} tone={live ? "ok" : undefined}>
            <View style={s.between}>
              <Text style={[s.subtitle, { flex: 1 }]}>{`${p.name}`}</Text>
              <Pill text={promoTag(p)} tone={live ? "ok" : "neutral"} />
            </View>
            <Note>{`${PROMO_KINDS[p.kind]} · ${promoTarget(p, products)}`}</Note>
            <Note>
              {p.from || p.to
                ? `Vigencia: ${p.from || "desde ya"} → ${p.to || "sin fin"}`
                : "Sin fecha de fin"}
            </Note>
            {!live && p.active && (
              <Note color={C.amber}>
                {p.from && day < p.from ? "Aún no empieza." : "Ya terminó."}
              </Note>
            )}
            <View style={s.between}>
              <Text style={[s.body, { flex: 1 }]}>
                {p.active ? "Activa" : "Pausada"}
              </Text>
              <Switch
                accessibilityLabel={`Activa ${p.name}`}
                value={p.active}
                onValueChange={(v) => {
                  try {
                    b.savePromo({ ...p, active: v });
                    changed(v ? "Promoción activada" : "Promoción pausada");
                  } catch (e) {
                    Alert.alert(
                      "Promoción",
                      e instanceof Error ? e.message : String(e),
                    );
                  }
                }}
              />
            </View>
            <View style={s.wrap}>
              <Button
                title="Editar"
                secondary
                small
                onPress={() => (setErr(""), setEdit(toDraft(p)))}
              />
              <Button
                title="Eliminar"
                danger
                small
                onPress={() =>
                  Alert.alert(
                    "Eliminar promoción",
                    `¿Quitar «${p.name}»? Las ventas ya hechas conservan su descuento.`,
                    [
                      { text: "Volver", style: "cancel" },
                      {
                        text: "Eliminar",
                        style: "destructive",
                        onPress: () => (
                          b.deletePromo(p.id),
                          changed("Promoción eliminada")
                        ),
                      },
                    ],
                  )
                }
              />
            </View>
          </Card>
        );
      })}
      {!promos.length && !edit && (
        <Note color={C.amber}>Aún no tienes promociones.</Note>
      )}
      {edit ? (
        <Card tone="ok">
          <Text style={s.subtitle}>
            {edit.id ? "Editar promoción" : "Nueva promoción"}
          </Text>
          {field("name", "Nombre que verá el cliente *", false)}
          <Text style={s.label}>Tipo</Text>
          <Chips
            options={Object.entries(PROMO_KINDS).map(([id, name]) => ({
              id,
              name,
            }))}
            value={edit.kind}
            onChange={(v) => setEdit({ ...edit, kind: v as Promo["kind"] })}
          />
          {edit.kind === "nxm" ? (
            <View style={s.wrap}>
              <View style={{ flex: 1, minWidth: 120 }}>
                {field("n", "Lleva (piezas)")}
              </View>
              <View style={{ flex: 1, minWidth: 120 }}>
                {field("m", "Paga (piezas)")}
              </View>
            </View>
          ) : (
            <View style={s.wrap}>
              {edit.kind === "volume" && (
                <View style={{ flex: 1, minWidth: 120 }}>
                  {field("minQty", "Desde (piezas)")}
                </View>
              )}
              <View style={{ flex: 1, minWidth: 120 }}>
                {field("percent", "Descuento %")}
              </View>
            </View>
          )}
          <Text style={s.label}>Aplica a</Text>
          <Chips
            options={[
              { id: "all", name: "Todo" },
              { id: "segment", name: "Una categoría" },
              { id: "product", name: "Un producto" },
            ]}
            value={edit.target}
            onChange={(v) =>
              setEdit({ ...edit, target: v as Promo["target"], ref: "" })
            }
          />
          {edit.target === "segment" && (
            <Chips
              options={segments.map((x) => ({ id: x, name: x }))}
              value={edit.ref}
              onChange={(v) => setEdit({ ...edit, ref: v })}
            />
          )}
          {edit.target === "product" && (
            <>
              {!!edit.ref && (
                <Note>{`Producto: ${products.find((p) => p.id === edit.ref)?.name || edit.ref}`}</Note>
              )}
              <SearchBox
                value={find}
                onChange={setFind}
                placeholder="Buscar producto"
              />
              <Chips
                options={matches.map((p) => ({ id: p.id, name: p.name }))}
                value={edit.ref}
                onChange={(v) => (setEdit({ ...edit, ref: v }), setFind(""))}
              />
            </>
          )}
          <DateField
            label="Empieza (opcional)"
            value={edit.from}
            onChange={(v) => setEdit({ ...edit, from: v })}
            quick={QUICK_CAMPAIGN}
          />
          <DateField
            label="Termina (opcional)"
            value={edit.to}
            onChange={(v) => setEdit({ ...edit, to: v })}
            quick={QUICK_CAMPAIGN}
          />
          {!!sample && !!example(edit, sample.price) && (
            <Note>{example(edit, sample.price)}</Note>
          )}
          {(() => {
            const low = belowCost(edit, products);
            if (!low.length) return null;
            const x = low[0];
            return (
              <Note
                color={C.amber}
              >{`Con esta promoción ${low.length === 1 ? "1 producto queda" : `${low.length} productos quedan`} debajo de su costo (por ejemplo ${x.name}: te cuesta ${money(x.cost)} y cobrarías ${money(x.unit)} por pieza). Al vender se permitirá porque tú la configuraste.`}</Note>
            );
          })()}
          {!!err && <Note color={C.red}>{err}</Note>}
          <View style={s.wrap}>
            <Button title="Guardar promoción" onPress={save} />
            <Button
              title="Cancelar"
              secondary
              onPress={() => (setEdit(null), setErr(""))}
            />
          </View>
        </Card>
      ) : (
        <Button
          title="＋ Nueva promoción"
          onPress={() => (setErr(""), setEdit({ ...EMPTY }))}
        />
      )}
    </>
  );
}
