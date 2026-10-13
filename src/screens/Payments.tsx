import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { localDay, money, today, type Business } from "../business";
import { paymentRows } from "../payments";
import { Button, C, Card, Chips, Note, SearchBox, s } from "../ui";

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
  const shown = rows.filter(
    (r) =>
      localDay(r.created) >= from &&
      (method === "Todos" || r.method === method) &&
      (!query.trim() ||
        [r.folio, r.customer, r.account, r.method, r.kind]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  );
  const received = shown
      .filter((r) => r.amount > 0)
      .reduce((sum, r) => sum + r.amount, 0),
    returned = -shown
      .filter((r) => r.amount < 0)
      .reduce((sum, r) => sum + r.amount, 0);
  const widths = [150, 115, 170, 130, 145, 110, 110];
  const cell = (value: string, index: number, header = false) => (
    <Text
      key={index}
      style={[
        s.body,
        {
          width: widths[index],
          padding: 10,
          fontWeight: header ? "700" : "400",
          color: header ? C.ink : C.muted,
        },
      ]}
    >
      {value}
    </Text>
  );
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
        <Note>
          El neto de esta tabla corresponde a cobros menos devoluciones. Las
          comisiones y gastos se consultan en Reportes y Corte de caja.
        </Note>
      </Card>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <View style={{ flexDirection: "row", backgroundColor: C.soft }}>
            {heading.map((h, i) => cell(h, i, true))}
          </View>
          {shown.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={"Ver venta " + r.folio}
              onPress={() => onSale(r.saleId)}
              style={{
                flexDirection: "row",
                borderBottomWidth: 1,
                borderBottomColor: C.line,
              }}
            >
              {[
                new Date(r.created).toLocaleString("es-MX"),
                r.folio,
                r.customer,
                r.method,
                r.account,
                r.kind,
                money(r.amount),
              ].map((v, i) => cell(v, i))}
            </Pressable>
          ))}
        </View>
      </ScrollView>
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
