// Importación 0.8/0.9 desde los Excel originales. La app ya no la usa (1.2 en
// adelante no trae datos dentro del APK); solo sirve para cargar los datos de
// prueba con los que se validan las pantallas.
import { assert, TABLES, type Business, type Row } from "../../src/business.ts";

export function initialize(b: Business, raw: string) {
  // Los ajustes del teléfono (rol, conexión) no cuentan como datos del negocio.
  if (TABLES.some((t) => t !== "settings" && b.one(`SELECT COUNT(*) n FROM ${t}`).n > 0))
    return false;
  b.restore(raw);
  return true;
}

// One-time update for installations seeded by the previous APK. Each imported
// folio is identified by its Excel ID; user-created records are left intact.
export function mergeCatalogueUpdate(b: Business, raw: string): string[] {
  const patch = JSON.parse(raw);
  assert(patch.release === "2026-09-30", "Actualización incompatible.");
  if (b.setting("dataRelease") === patch.release) return [];
  const warnings: string[] = [];
  const insert = (table: string, row: Row) => {
    assert(TABLES.includes(table), "Tabla no admitida.");
    const cols = b.all(`PRAGMA table_info(${table})`).map((c) => c.name);
    assert(cols.every((c) => c in row), "Importación incompleta.");
    b.run(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
      ...cols.map((c) => row[c]),
    );
  };
  b.transaction(() => {
    for (const item of patch.catalogue as Row[]) {
      const current = b.db.getFirstSync<Row>(
        "SELECT * FROM products WHERE id=?",
        item.id,
      );
      if (!current) continue;
      if (
        ["sku", "name", "category", "price", "minimum"].every(
          (key) => current[key] === item.old[key],
        )
      ) {
        b.run(
          "UPDATE products SET name=?,category=?,price=? WHERE id=?",
          item.new.name,
          item.new.category,
          item.new.price,
          item.id,
        );
      }
      const currentMeta = b.setting("product:" + item.id, {});
      const nextMeta = { ...currentMeta };
      for (const [key, value] of Object.entries(item.newMeta)) {
        if (
          currentMeta[key] === undefined ||
          JSON.stringify(currentMeta[key]) === JSON.stringify(item.oldMeta[key])
        )
          nextMeta[key] = value;
      }
      b.setSetting("product:" + item.id, nextMeta);
    }
    for (const sale of patch.sales as Row[]) {
      const existing = b.db.getFirstSync<Row>(
        "SELECT id FROM sales WHERE id=?",
        sale.id,
      );
      const duplicate = b.sales().some((s) => s.folio === sale.id);
      if (existing || duplicate) continue;
      const moves = (patch.stock_moves as Row[]).filter((m) => m.ref === sale.id);
      const enough = moves.every(
        (m) =>
          (b.db.getFirstSync<Row>("SELECT qty FROM lots WHERE id=?", m.lotId)
            ?.qty ?? 0) >= -m.qty,
      );
      if (!enough) {
        warnings.push(
          `${sale.id}: inventario insuficiente para incorporar la entrega del Excel; revisa el stock y restaura un respaldo si hace falta.`,
        );
        continue;
      }
      let customerId = sale.customerId;
      const customer = (patch.customers as Row[]).find(
        (c) => c.id === customerId,
      );
      if (customer) {
        const byName = b.db.getFirstSync<Row>(
          "SELECT id FROM customers WHERE name=? COLLATE NOCASE",
          customer.name,
        );
        if (byName) customerId = byName.id;
        else if (!b.db.getFirstSync("SELECT id FROM customers WHERE id=?", customerId))
          insert("customers", customer);
      }
      insert("sales", { ...sale, customerId });
      for (const line of (patch.sale_lines as Row[]).filter(
        (x) => x.saleId === sale.id,
      )) {
        insert("sale_lines", line);
        for (const allocation of (patch.allocations as Row[]).filter(
          (a) => a.lineId === line.id,
        ))
          insert("allocations", allocation);
      }
      for (const move of moves) {
        b.run("UPDATE lots SET qty=qty+? WHERE id=?", move.qty, move.lotId);
        insert("stock_moves", move);
      }
      for (const payment of (patch.ledger as Row[]).filter(
        (l) => l.ref === sale.id,
      )) insert("ledger", payment);
      const metadata = (patch.settings as Row[]).find(
        (s) => s.key === "sale:" + sale.id,
      );
      if (metadata) insert("settings", metadata);
    }
    for (const expense of (patch.ledger as Row[]).filter(
      (l) => l.ref === "IL002",
    ))
      if (!b.db.getFirstSync("SELECT id FROM ledger WHERE id=?", expense.id))
        insert("ledger", expense);
    const before = b.setting("importWarnings", []);
    b.setSetting("importWarnings", [
      ...before,
      ...(patch.importWarnings as string[]).filter(
        (w) => !before.includes(w),
      ),
      ...warnings,
    ]);
    if (!warnings.length) b.setSetting("dataRelease", patch.release);
    b.audit("import.update", patch.release, "Catálogo y folios nuevos del Excel.");
  });
  return warnings;
}
