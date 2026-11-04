// PDF de prueba con la misma estructura que imprime Chrome (Skia) para un pedido de
// Suplementos GYM: fuentes Type0/Identity-H con ToUnicode, flujos FlateDecode, matriz cm
// invertida y columnas (izquierda con el nombre cortado, derecha con el nombre completo).
// Datos ficticios: no es un pedido real.
const { zlibSync } = require("fflate");

function buildPdf(pages) {
  const chars = new Map();
  const code = (ch) => {
    if (!chars.has(ch)) chars.set(ch, chars.size + 1);
    return chars.get(ch);
  };
  const hex = (t) => [...t].map((ch) => code(ch).toString(16).padStart(4, "0")).join("");
  const contents = pages.map((items) => {
    let s = "q\n1 0 0 -1 0 792 cm\n";
    for (const [x, y, text, size = 10] of items) s += `BT\n/F4 ${size} Tf\n1 0 0 -1 ${x} ${y} Tm\n<${hex(text)}> Tj\nET\n`;
    return s + "Q\n";
  });
  const objs = [];
  const add = (body) => (objs.push(body), objs.length);
  const enc = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
  const stream = (dict, data) => ({ dict, data });
  const catalog = add(null);
  const pagesId = add(null);
  // ToUnicode con bfchar (y un bfrange para el espacio y los dígitos).
  const entries = [...chars.keys()];
  const fontWidths = add(null);
  const toUni = add(null);
  const fontId = add(null);
  const pageIds = [];
  for (const c of contents) {
    const cid = add(stream(`/Filter /FlateDecode`, zlibSync(enc(c))));
    const pid = add(`<</Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F4 ${fontId} 0 R>>>> /Contents ${cid} 0 R>>`);
    pageIds.push(pid);
  }
  const all = [...chars.entries()];
  let cmap = "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n";
  for (let i = 0; i < all.length; i += 90) {
    const part = all.slice(i, i + 90);
    cmap += `${part.length} beginbfchar\n${part.map(([ch, n]) => `<${n.toString(16).padStart(4, "0")}> <${ch.charCodeAt(0).toString(16).padStart(4, "0")}>`).join("\n")}\nendbfchar\n`;
  }
  cmap += "endcmap CMapName currentdict /CMap defineresource pop end end\n";
  objs[catalog - 1] = `<</Type /Catalog /Pages ${pagesId} 0 R>>`;
  objs[pagesId - 1] = `<</Type /Pages /Kids [${pageIds.map((p) => p + " 0 R").join(" ")}] /Count ${pageIds.length}>>`;
  objs[toUni - 1] = stream("/Filter /FlateDecode", zlibSync(enc(cmap)));
  objs[fontWidths - 1] = `<</Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+ArialMT /CIDSystemInfo <</Registry (Adobe) /Ordering (Identity) /Supplement 0>> /DW 556 /W [1 [${entries.map((ch) => (ch === " " ? 278 : 556)).join(" ")}]]>>`;
  objs[fontId - 1] = `<</Type /Font /Subtype /Type0 /BaseFont /AAAAAA+ArialMT /Encoding /Identity-H /DescendantFonts [${fontWidths} 0 R] /ToUnicode ${toUni} 0 R>>`;
  // Escritura del archivo (objetos en orden, sin tabla xref: el lector no la necesita).
  const parts = [enc("%PDF-1.4\n%\xd3\xeb\xe9\xe1\n")];
  let len = parts[0].length;
  const push = (u) => (parts.push(u), (len += u.length));
  objs.forEach((o, i) => {
    const n = i + 1;
    if (o && typeof o === "object") {
      push(enc(`${n} 0 obj\n<<${o.dict} /Length ${o.data.length}>> stream\n`));
      push(o.data);
      push(enc("\nendstream\nendobj\n"));
    } else push(enc(`${n} 0 obj\n${o}\nendobj\n`));
  });
  push(enc(`trailer\n<</Size ${objs.length + 1} /Root ${catalog} 0 R>>\n%%EOF\n`));
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) (out.set(p, off), (off += p.length));
  return out;
}

/** Un producto con el mismo acomodo que el PDF real (y = desde arriba de la hoja). */
function item(y, { brand, left, name, flavor, price, qty, sub }) {
  const out = [
    [166.3, y, brand],
    [238.6, y, "Precio"],
    [289.3, y + 2.2, "Cantidad"],
    [344.1, y, "Subtotal"],
    [403.8, y, brand],
    [238.6, y + 11.9, price],
    [344.1, y + 11.9, sub],
    [289.3, y + 15.9, String(qty)],
  ];
  left.forEach((t, i) => out.push([177.5, y + 31.5 + i * 10.8, t]));
  out.push([415.0, y + 31.5, name]);
  if (flavor) {
    out.push([403.8, y + 58.5, "Sabor: " + flavor]);
    out.push([166.3, y + 80, "Sabor: " + flavor.split(" ")[0]]);
  }
  return out;
}
function header(order, page, total) {
  return [
    [24, 15.3, "28/10/26, 19:14"],
    [300.8, 15.3, `Imprimir Pedido # ${order}`],
    ...(page === 1
      ? [
          [382.4, 38.9, `Pedido #${order}`],
          [382.4, 63.5, "Fecha de Pedido: 28 de octubre de 2026"],
          [382.4, 82.9, "Estatus: Pendiente de Pago"],
          [47.9, 170.1, `Productos Pedidos (${total})`],
        ]
      : []),
    [53.8, page === 1 ? 206.1 : 30, "Nombre del Producto"],
    [250.3, page === 1 ? 206.1 : 30, "Precio"],
    [299.4, page === 1 ? 206.1 : 30, "Cant."],
    [353.7, page === 1 ? 206.1 : 30, "Sub-total"],
  ];
}
function footer(page, pages, sums) {
  return [
    [284.1, 563.4, "Sub-total"],
    [350.1, 563.4, sums.sub],
    [275.1, 586.5, "Envío DHL"],
    [359.0, 586.5, sums.ship],
    [275.7, 609.6, "Descuento"],
    [355.5, 609.6, sums.disc],
    [299.4, 632.3, "Total"],
    [344.8, 632.3, sums.total],
    [24.0, 768.3, "https://www.suplementosgym.com.mx/sales/order/print/order_id/999999/"],
    [576.9, 768.3, `${page}/${pages}`],
  ];
}

/** Pedido ficticio #0700001: creatina (existente), Psychotic Black 60 en dos sabores y Psychotic Gold. */
function sampleOrder() {
  const sums = { sub: "$3,026.38", ship: "$127.00", disc: "-$151.32", total: "$3,002.06" };
  const p1 = [
    ...header("0700001", 1, 7),
    ...item(225.9, { brand: "GAT Sport", left: ["Creatine", "1 Kg"], name: "Creatine 1 Kg", price: "$523.34", qty: 3, sub: "$1,570.02" }),
    ...item(331.7, { brand: "Insane Labz", left: ["Psychotic", "Black 60", "Servings"], name: "Psychotic Black 60 Servings", flavor: "Grape", price: "$413.28", qty: 2, sub: "$826.56" }),
    ...item(442.7, { brand: "Insane Labz", left: ["Psychotic", "Black 60", "Servings"], name: "Psychotic Black 60 Servings", flavor: "Fruit Punch", price: "$413.28", qty: 1, sub: "$413.28" }),
    ...footer(1, 2, sums),
  ];
  const p2 = [
    ...header("0700001", 2, 7),
    ...item(50, { brand: "Insane Labz", left: ["Psychotic", "Gold 200", "Gr"], name: "Psychotic Gold 200 Gr", flavor: "Fruit Punch", price: "$216.52", qty: 1, sub: "$216.52" }),
    ...footer(2, 2, sums),
  ];
  return buildPdf([p1, p2]);
}

module.exports = { buildPdf, sampleOrder };
