// 2.8.2 · Productos repetidos en Stock: el mismo producto (marca, tipo de suplemento,
// presentación y sabor) dado de alta más de una vez. Se pueden unificar o eliminar.
import type { Business, Row } from "./business";
import { fold, known } from "./supplierOrder";

export type DuplicateGroup = { key: string; products: Row[] };

export function duplicateGroups(b: Business): DuplicateGroup[] {
  const rows = new Map(b.stock().map((p: Row) => [p.id, p]));
  const groups = new Map<string, Row[]>();
  for (const k of known(b)) {
    if (k.archived) continue;
    const key = [fold(k.brand), [...new Set(k.base)].sort().join(" "), k.size, k.flavor].join("|");
    if (!k.base.length) continue;
    const list = groups.get(key) ?? [];
    list.push(rows.get(k.id)!);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      // Primero el que conviene conservar: el que tiene más piezas.
      products: [...list].sort((x, y) => (Number(y.stock) || 0) - (Number(x.stock) || 0) || String(x.name).localeCompare(String(y.name))),
    }));
}
