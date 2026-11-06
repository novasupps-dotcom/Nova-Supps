import React, { useMemo, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { Text } from "../text";
import { localDay, money, today, type Business } from "../business";
import { paymentRows } from "../payments";
import { Button, C, Card, Chips, Note, SearchBox, s } from "../ui";
import { normalize } from "./ownerShared";

export function PaymentsPage({
  b,
  revision,
  onSale,
}: {
  b: Business;
  revision: number;
  onSale: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [period, setPeriod] = useState("Hoy"),
    [method, setMethod] = useState("Todos");
  const rows = useMemo(() => paymentRows(b), [b, revision]);
  const day = today();
  const since = new Date(day + "T12:00:00");
  since.setDate(since.getDate() - 6);
  const from =
    period === "Hoy"
      ? day
      : period === "7 días"
        ? localDay(since.toISOString())
        : period === "Mes"
          ? day.slice(0, 7) + "-01"
          : "";
  const qNorm = normalize(query);
  const shown = rows.filter(
    (r) =>
      localDay(r.created) >= from &&
      (method === "Todos" || r.method === method) &&
      (!qNorm ||
        normalize(
          [r.folio, r.customer, r.account, r.method, r.kind].join(" "),
        ).includes(qNorm)),
  );
  const received = shown
      .filter((r) => r.amount > 0)
      .reduce((sum, r) => sum + r.amount, 0),
    returned = -shown
      .filter((r) => r.amount < 0)
      .reduce((sum, r) => sum + r.amount, 0);
  const heading = [
    "Fecha",
    "Folio",
    "Cliente",
    "Forma de pago",
    "Cuenta",
    "Tipo",
    "Importe",
  ];
  return (
    <>
      <Chips
        row
        options={["Hoy", "7 días", "Mes", "Todo"].map((name) => ({
          id: name,
          name,
        }))}
        value={period}
        onChange={setPeriod}
      />
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Buscar cobro por folio, cliente o cuenta"
      />
      <Chips
        row
        options={["Todos", ...new Set(rows.map((r) => r.method))].map(
          (name) => ({ id: name, name }),
        )}
        value={method}
        onChange={setMethod}
      />
      <Card>
        <Text style={s.subtitle}>{shown.length} movimientos</Text>
        <Note>{`Cobros y abonos: ${money(received)} · Devoluciones: ${money(returned)}`}</Note>
        <Text style={s.price}>{`Neto: ${money(received - returned)}`}</Text>
        <Note>Neto = cobros menos devoluciones. Comisiones y gastos están en Reportes y Corte de caja.</Note>
      </Card>
      {!!shown.length && (
        <View style={s.list}>
          {shown.map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={"Ver venta " + r.folio}
              onPress={() => onSale(r.saleId)}
              style={({ pressed }) => [
                s.cartRow,
                {
                  paddingHorizontal: 16,
                  borderBottomWidth: i === shown.length - 1 ? 0 : 1,
                },
                pressed && { backgroundColor: C.soft },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={1}>
                  {`${r.folio} · ${r.customer}`}
                </Text>
                <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>
                  {`${new Date(r.created).toLocaleString("es-MX")} · ${r.method} · ${r.account} · ${r.kind}`}
                </Text>
              </View>
              <Text
                style={[
                  s.price,
                  { fontSize: 16, marginVertical: 0 },
                  r.amount < 0 && { color: C.red },
                ]}
              >
                {money(r.amount)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {!shown.length && <Note>No hay cobros en este periodo.</Note>}
      <Button
        title="Compartir tabla de cobros"
        secondary
        small
        disabled={!shown.length}
        onPress={() =>
          void Share.share({
            message:
              "Nova Negocio · Cobros · " +
              period +
              "\n\n" +
              heading.join(" | ") +
              "\n" +
              shown
                .map((r) =>
                  [
                    new Date(r.created).toLocaleString("es-MX"),
                    r.folio,
                    r.customer,
                    r.method,
                    r.account,
                    r.kind,
                    money(r.amount),
                  ].join(" | "),
                )
                .join("\n") +
              "\n\nNeto: " +
              money(received - returned),
          }).catch(() => {})
        }
      />
    </>
  );
}
