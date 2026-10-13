// Datos para que el cliente pague por transferencia (Mercado Pago, Banamex…).
// El dueño los captura una vez, los asigna a cada vendedor y se muestran SOLO
// cuando la forma de pago es transferencia, con un botón para mandarlos al cliente.
import React from "react";
import { Linking, Share, Text, View } from "react-native";
import { money, type Row } from "./business";
import { C, s, Button, Card, Note } from "./ui";

export type TransferAccount = { id: string; label: string; bank: string; holder: string; clabe: string; account: string; card: string; note: string; accountId?: string };
export const TRANSFER_TEMPLATES: TransferAccount[] = [
  { id: "mercadopago", label: "Mercado Pago", bank: "Mercado Pago", holder: "", clabe: "", account: "", card: "", note: "" },
  { id: "banamex", label: "Banamex", bank: "Banamex", holder: "", clabe: "", account: "", card: "", note: "" },
];
const digits = (x: string) => String(x || "").replace(/\D/g, "");

/** CLABE de 18 dígitos con su dígito verificador (pesos 3-7-1). "" si está bien. */
export function clabeProblem(raw: string): string {
  const d = digits(raw);
  if (!d) return "";
  if (d.length !== 18) return "La CLABE debe tener 18 dígitos.";
  const w = [3, 7, 1];
  const sum = d
    .slice(0, 17)
    .split("")
    .reduce((n, c, i) => n + ((Number(c) * w[i % 3]) % 10), 0);
  return (10 - (sum % 10)) % 10 === Number(d[17]) ? "" : "Esa CLABE no es válida: revisa los dígitos.";
}
export function validateTransfer(a: TransferAccount): string {
  if (!a.label.trim()) return "Ponle un nombre (por ejemplo Banamex).";
  if (!a.holder.trim()) return "Escribe el nombre del titular.";
  if (!digits(a.clabe) && !digits(a.account) && !digits(a.card)) return "Escribe al menos la CLABE, el número de cuenta o la tarjeta.";
  const c = clabeProblem(a.clabe);
  if (c) return c;
  if (digits(a.card) && (digits(a.card).length < 15 || digits(a.card).length > 16)) return "La tarjeta debe tener 16 dígitos.";
  return "";
}
export const cleanTransfer = (a: Row): TransferAccount => ({
  id: String(a.id || "").slice(0, 40),
  label: String(a.label || "").trim().slice(0, 40),
  bank: String(a.bank || "").trim().slice(0, 40),
  holder: String(a.holder || "").trim().slice(0, 80),
  clabe: digits(a.clabe).slice(0, 18),
  account: digits(a.account).slice(0, 20),
  card: digits(a.card).slice(0, 16),
  note: String(a.note || "").trim().slice(0, 120),
  ...(a.accountId ? { accountId: String(a.accountId) } : {}),
});
const group = (d: string, size = 4) => d.replace(new RegExp(`(\\d{${size}})(?=\\d)`, "g"), "$1 ");

/** Texto para mandar al cliente (WhatsApp u otra app). */
export function transferText(list: TransferAccount[], amount: number | null, concept = ""): string {
  const lines = ["*GNS · Nova Supps* · Datos para transferencia"];
  if (amount) lines.push(`Total a pagar: *${money(amount)}*`);
  for (const a of list) {
    lines.push("", `*${a.label}*${a.bank && a.bank !== a.label ? ` (${a.bank})` : ""}`, `Titular: ${a.holder}`);
    if (a.clabe) lines.push(`CLABE: ${a.clabe}`);
    if (a.account) lines.push(`Cuenta: ${a.account}`);
    if (a.card) lines.push(`Tarjeta: ${group(a.card)}`);
    if (a.note) lines.push(a.note);
  }
  if (concept) lines.push("", `Concepto: ${concept}`);
  lines.push("", "Envíanos tu comprobante por este medio. ¡Gracias!");
  return lines.join("\n");
}

/** Tarjeta con los datos y el botón para mandarlos. */
export function TransferInfo({ list, amount, phone, concept, emptyText }: { list: TransferAccount[]; amount: number | null; phone?: string; concept?: string; emptyText: string }) {
  if (!list.length)
    return (
      <Card tone="warn">
        <Note>{emptyText}</Note>
      </Card>
    );
  const text = transferText(list, amount, concept);
  const wa = String(phone || "").replace(/\D/g, "");
  return (
    <Card>
      <Text style={s.subtitle}>🏦 Datos para transferencia</Text>
      {list.map((a) => (
        <View key={a.id} style={{ marginTop: 8 }}>
          <Text style={[s.body, { fontWeight: "700" }]}>{a.label}</Text>
          <Note>{`Titular: ${a.holder}`}</Note>
          {!!a.clabe && <Text style={[s.body, { letterSpacing: 1 }]}>{`CLABE ${group(a.clabe, 3)}`}</Text>}
          {!!a.account && <Text style={s.body}>{`Cuenta ${a.account}`}</Text>}
          {!!a.card && <Text style={[s.body, { letterSpacing: 1 }]}>{`Tarjeta ${group(a.card)}`}</Text>}
          {!!a.note && <Note>{a.note}</Note>}
        </View>
      ))}
      <View style={{ height: 8 }} />
      {wa.length >= 10 ? (
        <Button title="💬 Enviar datos por WhatsApp" small onPress={() => void Linking.openURL(`https://wa.me/${wa.length === 10 ? "52" + wa : wa}?text=${encodeURIComponent(text)}`).catch(() => {})} />
      ) : null}
      <Button title="📤 Compartir datos con el cliente" secondary small onPress={() => void Share.share({ message: text }).catch(() => {})} />
      <Note color={C.muted}>Confirma que el dinero llegó antes de entregar.</Note>
    </Card>
  );
}
