import type { Business } from "./business";

export type PaymentRow = {
  id: string;
  saleId: string;
  created: string;
  folio: string;
  customer: string;
  method: string;
  account: string;
  kind: "Cobro" | "Abono" | "Devolución";
  amount: number;
};
/** Movimientos reales de dinero: incluye abonos posteriores y devoluciones. */
export function paymentRows(b: Business): PaymentRow[] {
  const meta = b.settingsMap("sale:");
  const names: Record<string, string> = {
    Efectivo: "Efectivo",
    Banco: "Transferencia",
    Tarjeta: "Tarjeta",
    Billetera: "Billetera",
  };
  return b
    .all(
      "SELECT l.id,l.ref,l.created,l.amount,l.kind,l.note,a.name account,a.kind method,c.name customer FROM ledger l JOIN accounts a ON a.id=l.accountId JOIN sales v ON v.id=l.ref LEFT JOIN customers c ON c.id=v.customerId WHERE l.kind IN ('sale','refund') AND l.amount<>0 ORDER BY l.created DESC,l.rowid DESC",
    )
    .map((r) => ({
      id: String(r.id),
      saleId: String(r.ref),
      created: String(r.created),
      folio: String(
        meta.get(String(r.ref))?.folio ||
          "V-" +
            String(r.ref)
              .replace(/[^A-Za-z0-9]/g, "")
              .slice(-6)
              .toUpperCase(),
      ),
      customer: String(r.customer || "Mostrador"),
      method: names[r.method] || String(r.method),
      account: String(r.account),
      kind:
        r.kind === "refund" || r.amount < 0
          ? "Devolución"
          : /^Abono/i.test(r.note)
            ? "Abono"
            : "Cobro",
      amount: Number(r.amount),
    }));
}
