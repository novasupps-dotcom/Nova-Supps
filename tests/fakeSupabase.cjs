// Supabase y Mercado Pago simulados para pruebas: Auth, PostgREST con las
// mismas reglas de permisos que supabase/schema.sql, RPC y la función
// cobro-terminal real (supabase/functions/cobro-terminal/index.ts).
const fs = require("fs"), ts = require("typescript"), path = require("path");
function loadTs(file) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "module", "require", code)(m.exports, m, require);
  return m.exports;
}
const fn = loadTs(path.join(__dirname, "../supabase/functions/cobro-terminal/index.ts"));
const BASE = "https://demo.supabase.co";
const ANON = "anon-key-0123456789abcdefghij";

function createFake() {
  let seq = 0;
  const users = []; // {id,email,password}
  const tokens = new Map(); // token -> userId
  const refresh = new Map();
  const T = { members: [], catalog: [], customers: [], config: [], sales: [], invites: [], terminal_orders: [], seller_closings: [], owner_backups: [], owner_backup_parts: [] };
  const PK = { members: "user_id", catalog: "product_id", customers: "id", config: "key", sales: "id", invites: "code", terminal_orders: "order_id", seller_closings: "id", owner_backups: "id", owner_backup_parts: "pk" };
  const failures = [];
  const mp = { orders: new Map(), payments: new Map(), calls: [], terminals: [{ id: "NEWLAND_N950__X", operating_mode: "PDV", pos_id: 1, external_pos_id: "CAJA1" }], terminalsDown: false };
  const state = { offline: false, functionDeployed: true, mpToken: "APP_USR-secret" };

  // Dispositivo de la petición en curso (encabezado x-device-id), como request.headers en PostgREST.
  let currentDevice = "";
  const member = (uid) => T.members.find((m) => m.user_id === uid && m.active && m.device_id && m.device_id === currentDevice);
  const isOwner = (uid) => member(uid)?.role === "owner";
  const isMember = (uid) => !!member(uid);
  const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  const issue = (u) => {
    const access = `tok-${u.id}-${++seq}`, ref = `ref-${u.id}-${seq}`;
    tokens.set(access, u.id);
    refresh.set(ref, u.id);
    return { access_token: access, refresh_token: ref, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, email: u.email } };
  };
  function parseQuery(qs) {
    const q = new URLSearchParams(qs);
    const filters = [];
    let order = null;
    for (const [k, v] of q) {
      if (k === "select") continue;
      if (k === "order") {
        const [col, dir] = v.split(".");
        order = { col, desc: dir === "desc" };
        continue;
      }
      const [op, ...rest] = v.split(".");
      const val = rest.join(".");
      filters.push((r) => {
        const x = r[k] === null || r[k] === undefined ? null : String(r[k]);
        if (op === "eq") return x === val;
        if (op === "neq") return x !== val;
        if (op === "gte") return x !== null && x >= val;
        if (op === "lt") return x !== null && x < val;
        if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").includes(x);
        if (op === "is") return val === "null" ? x === null : true;
        return true;
      });
    }
    return { filters, order };
  }
  const canRead = (t, uid, r) =>
    uid === "service" ||
    (t === "members"
      ? r.user_id === uid || isOwner(uid)
      : t === "sales"
        ? r.seller_id === uid || isOwner(uid)
        : t === "invites" || t === "customers"
          ? isOwner(uid)
          : t === "terminal_orders"
            ? r.created_by === uid || isOwner(uid)
            : t === "seller_closings"
              ? (r.seller_id === uid && isMember(uid)) || isOwner(uid)
              : t === "owner_backups" || t === "owner_backup_parts"
                ? isOwner(uid)
                : isMember(uid));
  function canInsert(t, uid, r) {
    if (uid === "service") return true;
    if (t === "catalog" || t === "config" || t === "invites" || t === "owner_backups" || t === "owner_backup_parts") return isOwner(uid);
    if (t === "customers") return isMember(uid) && (r.created_by === uid || isOwner(uid));
    // 1.2: los vendedores ya no insertan ventas directo (solo submit_sale).
    return false;
  }
  const canUpdate = (t, uid, r) => uid === "service" || (t === "terminal_orders" || t === "seller_closings" ? false : t === "members" ? isOwner(uid) && r.role === "seller" : isOwner(uid));
  function rest(method, table, qs, body, uid, prefer) {
    if (!T[table]) return res(404, { message: "tabla" });
    // T.legacyCatalog: catálogo sin las columnas 2.1 (segment, barcode).
    if (T.legacyCatalog && table === "catalog" && ((Array.isArray(body) ? body : body ? [body] : []).some((r) => "segment" in r || "barcode" in r) || /segment|barcode/.test(String(qs.get ? qs.get("select") : qs))))
      return res(400, { code: "PGRST204", message: "Could not find the 'barcode' column of 'catalog' in the schema cache" });
    // T.legacyBackups: servidor sin el schema 2.1 (no existen las tablas de respaldo).
    if (T.legacyBackups && table.startsWith("owner_backup")) return res(404, { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` });
    if (uid === null) return res(401, { message: "permission denied" });
    const { filters, order } = parseQuery(qs);
    const visible = T[table].filter((r) => canRead(table, uid, r) && filters.every((f) => f(r)));
    if (method === "GET") {
      const out = [...visible];
      if (order) out.sort((a, b) => (a[order.col] < b[order.col] ? -1 : a[order.col] > b[order.col] ? 1 : 0) * (order.desc ? -1 : 1));
      return res(200, JSON.parse(JSON.stringify(out)));
    }
    if (method === "POST") {
      const rows = Array.isArray(body) ? body : [body];
      const upsert = /merge-duplicates/.test(prefer || "");
      const out = [];
      for (const raw of rows) {
        const existing = T[table].find((x) => x[PK[table]] === raw[PK[table]]);
        if (existing) {
          if (!upsert) return res(409, { code: "23505", message: "duplicate key value violates unique constraint" });
          if (!canUpdate(table, uid, existing)) return res(403, { message: "new row violates row-level security policy" });
          Object.assign(existing, raw);
          out.push(existing);
          continue;
        }
        const row = { ...raw };
        if (table === "owner_backups") Object.assign(row, { created_at: row.created_at ?? new Date(Date.now() + T.owner_backups.length).toISOString(), complete: row.complete ?? false });
        if (table === "owner_backup_parts") row.pk = `${row.backup_id}:${row.part}`;
        if (table === "sales") Object.assign(row, { seller_id: row.seller_id ?? uid, status: row.status ?? "pendiente", created_at: row.created_at ?? new Date().toISOString(), sale_id: row.sale_id ?? null, error: row.error ?? null, applied_at: row.applied_at ?? null, mp: row.mp ?? null });
        if (table === "customers") row.created_by = row.created_by ?? uid;
        if (!canInsert(table, uid, row)) return res(403, { message: "new row violates row-level security policy" });
        T[table].push(row);
        out.push(row);
      }
      return res(201, JSON.parse(JSON.stringify(out)));
    }
    if (method === "PATCH") {
      const out = [];
      for (const r of visible) if (canUpdate(table, uid, r)) {
        if (table === "members" && body.role && body.role !== "seller") return res(403, { message: "new row violates row-level security policy" });
        Object.assign(r, body);
        out.push(r);
      }
      return res(200, JSON.parse(JSON.stringify(out)));
    }
    if (method === "DELETE") {
      T[table] = T[table].filter((r) => !(visible.includes(r) && canUpdate(table, uid, r)));
      return res(204, null);
    }
  }
  function rpc(name, args, uid) {
    if (!uid) return res(401, { message: "permission denied" });
    const mine = T.members.find((m) => m.user_id === uid);
    if (name === "claim_owner") {
      if (!currentDevice) return res(400, { code: "P0001", message: "Actualiza la app a la versión 1.1.1 o posterior" });
      if (T.members.some((m) => m.role === "owner" && m.user_id !== uid)) return res(400, { code: "P0001", message: "Esta tienda ya tiene dueño registrado" });
      if (mine && mine.device_id && mine.device_id !== currentDevice) return res(400, { code: "P0001", message: "Tu cuenta de dueño está registrada en otro teléfono" });
      if (mine) Object.assign(mine, { role: "owner", active: true, name: args.p_name || mine.name, device_id: mine.device_id || currentDevice });
      else T.members.push({ user_id: uid, name: args.p_name || "Dueño", role: "owner", active: true, device_id: currentDevice, created_at: new Date().toISOString() });
      return res(200, "owner");
    }
    if (name === "request_join") {
      if (!mine) return res(200, "none");
      if (!currentDevice) return res(200, "update_app");
      if (!mine.device_id) Object.assign(mine, { device_id: currentDevice, device_at: new Date().toISOString() });
      else if (mine.device_id !== currentDevice) return res(200, "other_device");
      return res(200, mine.role === "owner" ? "owner" : mine.active ? "active" : "pending");
    }
    const raise = (message) => res(400, { code: "P0001", message });
    const gen = (prefix) => prefix + Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    const norm = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (name === "login_device") {
      if (!mine) return res(200, "none");
      if (!currentDevice) return res(200, "update_app");
      if (mine.device_id !== currentDevice) Object.assign(mine, { device_id: currentDevice, device_at: new Date().toISOString() });
      return res(200, mine.role === "owner" ? "owner" : mine.active ? "active" : "pending");
    }
    if (name === "create_invite") {
      if (!isOwner(uid)) return raise("Solo el dueño puede crear invitaciones");
      const code = gen("GNS");
      T.invites.push({ code, name: args.p_name || "Vendedor", kind: "seller", target: null, created_by: uid, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + (args.p_days || 7) * 86400000).toISOString(), revoked: false, used_by: null, used_at: null });
      return res(200, code);
    }
    if (name === "create_device_code") {
      if (!isOwner(uid)) return raise("Solo el dueño puede autorizar cambios de teléfono");
      const m = T.members.find((x) => x.user_id === args.p_user && x.role === "seller");
      if (!m) return raise("Vendedor no encontrado");
      for (const i of T.invites) if (i.kind === "device" && i.target === m.user_id && !i.used_at) i.revoked = true;
      const code = gen("CAM");
      T.invites.push({ code, name: m.name, kind: "device", target: m.user_id, created_by: uid, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 2 * 86400000).toISOString(), revoked: false, used_by: null, used_at: null });
      return res(200, code);
    }
    if (name === "create_owner_recovery") {
      if (!isOwner(uid)) return raise("Solo el dueño");
      for (const i of T.invites) if (i.kind === "owner_recovery" && i.target === uid && !i.used_at) i.revoked = true;
      const code = gen("REC");
      T.invites.push({ code, name: "Recuperación", kind: "owner_recovery", target: uid, created_by: uid, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 365 * 86400000).toISOString(), revoked: false, used_by: null, used_at: null });
      return res(200, code);
    }
    if (name === "redeem_device_code") {
      if (!currentDevice) return res(200, "update_app");
      const key = "u:" + uid;
      if (failures.filter((f) => f.key === key && f.at > Date.now() - 3600000).length >= 10) return res(200, "locked");
      const inv = T.invites.find((x) => x.code === norm(args.p_code) && ["device", "owner_recovery"].includes(x.kind) && x.target === uid);
      if (!inv || inv.revoked || inv.used_at) {
        failures.push({ key, at: Date.now() });
        return res(200, "invalid");
      }
      if (new Date(inv.expires_at).getTime() < Date.now()) return res(200, "expired");
      Object.assign(inv, { used_at: new Date().toISOString(), used_by: uid });
      if (mine) Object.assign(mine, { device_id: currentDevice, device_at: new Date().toISOString() });
      return res(200, "ok");
    }
    // ---- Ventas de vendedores (1.2): precios, existencias y cobros los decide el servidor ----
    const pendingQty = (pid) => T.sales.filter((v) => v.status === "pendiente" || v.status === "conflicto").reduce((n, v) => n + v.items.filter((i) => i.productId === pid).reduce((k, i) => k + Number(i.qty), 0), 0);
    const priced = (items) => {
      const sum = {};
      for (const i of Array.isArray(items) ? items : []) if (/^[0-9]{1,4}$/.test(String(i.qty)) && i.qty >= 1 && i.qty <= 999) sum[i.productId] = (sum[i.productId] || 0) + Number(i.qty);
      return Object.entries(sum)
        .map(([pid, q]) => {
          const c = T.catalog.find((x) => x.product_id === pid && !x.archived);
          return c && { product_id: pid, name: c.name, qty: q, price: c.price, available: Math.max(0, c.available - pendingQty(pid)), segment: c.segment || "" };
        })
        .filter(Boolean);
    };
    const feeBps = () => {
      const v = Number(T.config.find((c) => c.key === "fee")?.value?.bps);
      return Number.isInteger(v) && v >= 0 && v <= 2000 ? v : 406;
    };
    // 2.0: el cliente absorbe la comisión (mismo cálculo que public.client_price).
    const feeOf = (a, bps) => Math.round((a * bps) / 10000);
    const clientPrice = (base, bps) => {
      if (base <= 0 || bps <= 0) return Math.max(0, base);
      let t = Math.round((base * 10000) / (10000 - bps));
      while (t - feeOf(t, bps) < base) t++;
      while (t - 1 - feeOf(t - 1, bps) >= base) t--;
      return t;
    };
    // 2.1: promociones publicadas (mismo cálculo que public.promo_line_discount, día de la tienda).
    const storeDay = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
    const promoLine = (r) => {
      const list = T.config.find((c) => c.key === "promos")?.value?.list;
      let best = 0,
        name = null;
      const day = T.storeDay || storeDay();
      for (const p of Array.isArray(list) ? list : []) {
        if (String(p.active) !== "true") continue;
        if (p.from && day < p.from) continue;
        if (p.to && day > p.to) continue;
        if (p.target === "product" && (p.ref || "") !== r.product_id) continue;
        if (p.target === "segment" && (p.ref || "") !== r.segment) continue;
        let amt = 0;
        if (p.kind === "nxm") {
          const n = Number(p.n), m = Number(p.m);
          if (n >= 2 && m >= 1 && m < n) amt = Math.floor(r.qty / n) * (n - m) * r.price;
        } else {
          const pct = Number(p.percent);
          if (pct > 0 && pct <= 90 && (p.kind !== "volume" || r.qty >= Number(p.minQty || 0))) amt = Math.min(r.qty * r.price, Math.round((r.qty * r.price * pct) / 100));
        }
        if (amt > best) [best, name] = [amt, p.name];
      }
      return { amount: best, name };
    };
    const discOf = (rows) => rows.reduce((n, r) => n + promoLine(r).amount, 0);
    const totalOf = (rows) => {
      const bps = feeBps();
      const sub = rows.reduce((n, r) => n + r.qty * r.price, 0);
      const disc = discOf(rows);
      if (disc > 0) return clientPrice(sub - disc, bps);
      return Math.max(clientPrice(sub, bps), rows.reduce((n, r) => n + r.qty * clientPrice(r.price, bps), 0));
    };
    if (name === "seller_catalog") {
      if (!isMember(uid)) return res(200, []);
      return res(200, T.catalog.filter((c) => !c.archived).sort((a, b) => (a.name < b.name ? -1 : 1)).map((c) => ({ product_id: c.product_id, sku: c.sku, name: c.name, brand: c.brand, category: c.category, price: c.price, available: Math.max(0, c.available - pendingQty(c.product_id)), image_key: c.image_key, segment: c.segment || "", barcode: c.barcode || "" })));
    }
    if (name === "check_sale") {
      if (!isMember(uid)) return raise("Tu teléfono no está autorizado");
      const rows = priced(args.p_items);
      if (!rows.length || rows.length !== args.p_items.length) return res(200, { ok: false, error: "Productos no válidos" });
      const short = rows.filter((r) => r.qty > r.available).map((r) => ({ productId: r.product_id, name: r.name, available: r.available }));
      const sub = rows.reduce((n, r) => n + r.qty * r.price, 0);
      // T.legacy18: servidor sin el schema 2.0 (no suma la comisión).
      if (T.legacy18) return res(200, { ok: !short.length, total: sub, short, pass_fee: false, fee_bps: feeBps(), card_total: sub });
      // T.legacy20: servidor 2.0 sin promociones (no manda `promo` ni las aplica).
      if (T.legacy20) {
        const t20 = Math.max(clientPrice(sub, feeBps()), rows.reduce((n, r) => n + r.qty * clientPrice(r.price, feeBps()), 0));
        return res(200, { ok: !short.length, subtotal: sub, commission: t20 - sub, total: t20, pricing: "grossup", short, pass_fee: false, fee_bps: feeBps(), card_total: t20 });
      }
      const total = totalOf(rows);
      const disc = discOf(rows);
      return res(200, { ok: !short.length, subtotal: sub, promo: disc, commission: total - (sub - disc), total, pricing: "grossup", short, pass_fee: false, fee_bps: feeBps(), card_total: total });
    }
    if (name === "submit_sale") {
      if (!isMember(uid)) return raise("Tu teléfono no está autorizado para vender");
      if (!/^[A-Za-z0-9_-]{6,80}$/.test(String(args.p_id))) return raise("Venta inválida");
      const prev = T.sales.find((v) => v.id === args.p_id);
      if (prev) return prev.seller_id !== uid ? raise("Venta inválida") : res(200, { status: prev.status, total: prev.total, error: prev.error, duplicate: true });
      if (!["Efectivo", "Transferencia", "Tarjeta"].includes(args.p_method)) return raise("Forma de pago inválida");
      if (mine.role === "seller" && !(mine.methods || ["Tarjeta", "Efectivo", "Transferencia"]).includes(args.p_method)) return raise("El dueño no te habilitó cobrar con " + args.p_method.toLowerCase());
      const tid = args.p_method === "Transferencia" ? args.p_transfer_id || null : null;
      if (tid) {
        const list = T.config.find((c) => c.key === "transfer")?.value?.accounts || [];
        if (!list.some((t) => t.id === tid) || (Array.isArray(mine.transfer_ids) && !mine.transfer_ids.includes(tid))) return raise("Esa cuenta de transferencia no está disponible");
      }
      const rows = priced(args.p_items);
      if (!rows.length || rows.length !== args.p_items.length) return raise("Productos no válidos o archivados");
      const sub = rows.reduce((n, r) => n + r.qty * r.price, 0);
      // 2.0: el cliente absorbe la comisión con cualquier forma de pago.
      const bps = T.legacy18 ? null : feeBps();
      let total = T.legacy18 ? sub : totalOf(rows);
      const disc = T.legacy18 ? 0 : discOf(rows);
      let comm = total - (sub - disc);
      const short = rows.filter((r) => r.qty > r.available).map((r) => `${r.name} (hay ${r.available})`).join(", ");
      let mpRow = null,
        cardMismatch = null,
        cardTotal = 0;
      if (args.p_method === "Tarjeta") {
        const ord = T.terminal_orders.find((o) => o.order_id === (args.p_order_id || ""));
        if (!ord || ord.created_by !== uid) return raise("Ese cobro con tarjeta no es tuyo");
        if (ord.sale_id) return raise("Ese cobro con tarjeta ya se usó en otra venta");
        if (ord.status !== "aprobada") return raise("El cobro con tarjeta no está aprobado");
        // Ya se cobró: se guarda por lo cobrado y queda en revisión del dueño.
        if (ord.amount !== total) [cardMismatch, cardTotal] = [`Se cobró con tarjeta $${(ord.amount / 100).toFixed(2)} y con los precios actuales son $${(total / 100).toFixed(2)}`, ord.amount];
        ord.sale_id = args.p_id;
        mpRow = { orderId: ord.order_id, referenceId: ord.reference };
      }
      let status = "pendiente",
        error = null;
      if (cardMismatch) [status, error, total, comm] = ["conflicto", cardMismatch, cardTotal, Math.max(cardTotal - (sub - disc), 0)];
      if (short) [status, error] = ["conflicto", [error, "Sin existencias suficientes: " + short].filter(Boolean).join(" · ")];
      if (args.p_client_total != null && args.p_client_total !== total) {
        status = "conflicto";
        error = [error, `El vendedor cobró $${(args.p_client_total / 100).toFixed(2)} y con los precios actuales son $${(total / 100).toFixed(2)}`].filter(Boolean).join(" · ");
      }
      let cid = args.p_customer_id || null,
        cname = "",
        cphone = "";
      if (args.p_new_customer && String(args.p_new_customer.name || "").trim()) {
        cid = args.p_new_customer.id || "c-" + ++seq;
        cname = String(args.p_new_customer.name).trim().slice(0, 120);
        cphone = String(args.p_new_customer.phone || "").replace(/[^0-9+]/g, "").slice(0, 20);
        if (!T.customers.some((c) => c.id === cid)) T.customers.push({ id: cid, name: cname, phone: cphone, created_by: uid });
      } else if (cid) {
        const c = T.customers.find((x) => x.id === cid);
        if (c) cname = c.name;
        else cid = null;
      }
      const ct = args.p_client_time ? new Date(args.p_client_time).getTime() : NaN;
      T.sales.push({ transfer_id: tid, closing_id: null, id: args.p_id, seller_id: uid, seller_name: mine.name, created_at: new Date().toISOString(), client_time: ct > Date.now() - 7 * 86400000 && ct < Date.now() + 300000 ? args.p_client_time : null, items: rows.map((r) => ({ productId: r.product_id, name: r.name, qty: r.qty, price: r.price, ...(T.legacy18 ? {} : { discount: promoLine(r).amount, promo: promoLine(r).name }) })), total, ...(T.legacy18 ? {} : { subtotal: sub, commission: comm, fee_bps: bps, promo: disc }), client_total: args.p_client_total ?? null, method: args.p_method, customer_id: cid, customer_name: cname, customer_phone: cphone, note: String(args.p_note || "").slice(0, 300), mp: mpRow, status, error, sale_id: null, applied_at: null });
      return res(200, T.legacy18 ? { status, total, error } : { status, subtotal: sub, promo: disc, commission: comm, total, error });
    }
    const summary = (sellerId, closingId) => {
      const rows = T.sales.filter((v) => v.seller_id === sellerId && v.status !== "rechazada" && (closingId ? v.closing_id === closingId : !v.closing_id));
      const items = {};
      for (const v of rows) for (const i of v.items) {
        const x = (items[i.productId] = items[i.productId] || { productId: i.productId, name: i.name, qty: 0, total: 0 });
        x.qty += i.qty;
        x.total += i.qty * i.price;
      }
      const by = {};
      const got = (v) => v.client_total ?? v.total;
      for (const v of rows) by[v.method] = (by[v.method] || 0) + got(v);
      const times = rows.map((v) => v.created_at).sort();
      return { card_fee: rows.reduce((n, v) => n + got(v), 0) - Object.values(items).reduce((n, i) => n + i.total, 0), sales_count: rows.length, units: Object.values(items).reduce((n, i) => n + i.qty, 0), total: rows.reduce((n, v) => n + got(v), 0), review_count: rows.filter((v) => v.status === "conflicto").length, period_from: times[0] || null, period_to: times.at(-1) || null, by_method: by, items: Object.values(items).sort((a, b) => (a.name < b.name ? -1 : 1)), _rows: rows };
    };
    if (name === "register_preview") {
      if (!isMember(uid)) return raise("Tu teléfono no está autorizado");
      const { _rows, ...sm } = summary(uid, null);
      return res(200, sm);
    }
    if (name === "close_register") {
      if (!isMember(uid)) return raise("Tu teléfono no está autorizado");
      if (mine.role !== "seller") return raise("El cierre de caja es para vendedores");
      const { _rows, ...sm } = summary(uid, null);
      if (!sm.sales_count) return raise("No hay ventas nuevas desde tu último cierre de caja");
      const row = { id: "cl-" + ++seq, seller_id: uid, seller_name: mine.name, created_at: new Date(Date.now() + seq).toISOString(), ...sm, period_to: new Date().toISOString() };
      T.seller_closings.push(row);
      for (const v of _rows) v.closing_id = row.id;
      return res(200, row);
    }
    if (name === "seller_customers") {
      if (!isMember(uid)) return res(200, []);
      const q = String(args.p_query || "").trim();
      const digits = (x) => String(x || "").replace(/[^0-9]/g, "");
      const rows = T.customers.filter((c) => (q.length >= 2 ? c.name.toLowerCase().includes(q.toLowerCase()) || (digits(q).length && digits(c.phone).slice(-4) === digits(q).slice(-4)) : c.created_by === uid));
      return res(200, rows.sort((a, b) => (a.name < b.name ? -1 : 1)).slice(0, 20).map((c) => ({ id: c.id, name: c.name, phone_hint: c.phone.length >= 4 ? "•••" + c.phone.slice(-4) : "" })));
    }
    if (name === "receipt_phone") {
      const v = T.sales.find((x) => x.id === args.p_sale_id && x.seller_id === uid && isMember(uid) && new Date(x.created_at).getTime() > Date.now() - 2 * 86400000);
      if (!v) return res(200, null);
      return res(200, v.customer_phone || T.customers.find((c) => c.id === v.customer_id)?.phone || "");
    }
    // Solo el servidor (clave secreta) puede apartar/completar/liberar códigos.
    if (["invite_claim", "invite_finish", "invite_release"].includes(name) && uid !== "service") return res(403, { code: "42501", message: "permission denied for function " + name });
    if (name === "invite_claim") {
      const key = String(args.p_key || "").trim() || null;
      if (key && failures.filter((f) => f.key === key && f.at > Date.now() - 3600000).length >= 20) return res(200, "locked");
      const c = String(args.p_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const inv = T.invites.find((x) => x.code === c && (x.kind || "seller") === "seller");
      if (!inv || inv.revoked) {
        if (key) failures.push({ key, at: Date.now() });
        return res(200, "invalid");
      }
      if (inv.used_at) return res(200, "used");
      if (new Date(inv.expires_at).getTime() < Date.now()) return res(200, "expired");
      inv.used_at = new Date().toISOString();
      return res(200, "ok");
    }
    if (name === "invite_finish") {
      const inv = T.invites.find((x) => x.code === String(args.p_code).toUpperCase().replace(/[^A-Z0-9]/g, ""));
      if (!inv || !inv.used_at || inv.used_by) return res(400, { message: "Código no apartado" });
      inv.used_by = args.p_user;
      T.members.push({ pass_fee: false, methods: ["Tarjeta", "Efectivo", "Transferencia"], user_id: args.p_user, name: args.p_name || inv.name, role: "seller", active: true, device_id: args.p_device || null, device_at: new Date().toISOString(), created_at: new Date().toISOString() });
      return res(200, "active");
    }
    if (name === "prune_owner_backups") {
      if (!isOwner(uid)) return raise("Solo el dueño");
      const keep = new Set(T.owner_backups.filter((x) => x.complete).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, Math.max(3, Number(args.p_keep) || 14)).map((x) => x.id));
      const gone = T.owner_backups.filter((x) => !keep.has(x.id) && x.complete).map((x) => x.id);
      T.owner_backups = T.owner_backups.filter((x) => !gone.includes(x.id));
      T.owner_backup_parts = T.owner_backup_parts.filter((x) => !gone.includes(x.backup_id));
      return res(200, gone.length);
    }
    if (name === "invite_release") {
      const inv = T.invites.find((x) => x.code === String(args.p_code).toUpperCase().replace(/[^A-Z0-9]/g, ""));
      if (inv && !inv.used_by) inv.used_at = null;
      return res(200, null);
    }
    return res(404, { message: "rpc" });
  }
  // Mercado Pago simulado (solo lo que usa la función y la app del dueño).
  function mpApi(method, p, body) {
    mp.calls.push({ method, path: p, body });
    let m;
    if (method === "POST" && p === "/v1/orders") {
      const id = "ORD" + ++seq;
      const o = { id, status: "created", external_reference: body.external_reference, config: body.config, transactions: { payments: [{ id: "PAY" + seq, amount: body.transactions.payments[0].amount, status: "created" }] } };
      mp.orders.set(id, o);
      return res(201, o);
    }
    if (method === "GET" && (m = /^\/v1\/orders\/([^/]+)$/.exec(p))) return mp.orders.has(m[1]) ? res(200, mp.orders.get(m[1])) : res(404, { code: "order_not_found", message: "not found" });
    if (method === "POST" && (m = /^\/v1\/orders\/([^/]+)\/cancel$/.exec(p))) {
      const o = mp.orders.get(m[1]);
      o.status = "canceled";
      return res(200, o);
    }
    if (method === "GET" && (m = /^\/v1\/payments\/(\d+)$/.exec(p))) return mp.payments.has(m[1]) ? res(200, mp.payments.get(m[1])) : res(404, { message: "not found" });
    if (method === "GET" && p.startsWith("/terminals/v1/list")) return mp.terminalsDown ? res(500, { message: "down" }) : res(200, { data: { terminals: mp.terminals.map((t) => ({ ...t })) } });
    if (method === "GET" && p.startsWith("/v1/payments/search")) {
      const q = new URLSearchParams(p.split("?")[1] || "");
      const all = [...mp.payments.values()].sort((a, b) => (a.date_created < b.date_created ? 1 : -1));
      const off = Number(q.get("offset") || 0), lim = Number(q.get("limit") || 30);
      return res(200, { paging: { total: all.length, limit: lim, offset: off }, results: all.slice(off, off + lim) });
    }
    return res(404, { message: "mp" });
  }
  mp.approve = (orderId, card = {}) => {
    const o = mp.orders.get(orderId);
    const ref = String(700000 + ++seq);
    o.status = "processed";
    Object.assign(o.transactions.payments[0], { status: "processed", status_detail: "accredited", reference_id: ref, paid_amount: o.transactions.payments[0].amount, card: { last_digits: card.last4 || "4242" }, payment_method: { id: card.brand || "visa", type: "credit_card", installments: 1 } });
    mp.payments.set(ref, { id: Number(ref), status: "approved", operation_type: "pos_payment", external_reference: o.external_reference, transaction_amount: Number(o.transactions.payments[0].amount), authorization_code: card.authorization || "AUT123", payment_method_id: card.brand || "visa", payment_type_id: "credit_card", installments: 1, date_created: new Date().toISOString(), date_approved: new Date().toISOString(), card: { last_four_digits: card.last4 || "4242" }, fee_details: [{ type: "mercadopago_fee", amount: 1.11, fee_payer: "collector" }] });
    return ref;
  };
  // Cobro hecho directamente en la terminal (modo normal) o por otro medio (online).
  mp.charge = (amountCents, opts = {}) => {
    const ref = String(800000 + ++seq);
    const when = new Date(Date.now() - (opts.minutesAgo || 0) * 60000).toISOString();
    mp.payments.set(ref, { id: Number(ref), status: opts.status || "approved", operation_type: opts.online ? "regular_payment" : "pos_payment", ...(opts.online ? {} : { point_of_interaction: { type: "POINT" } }), external_reference: opts.reference || null, transaction_amount: amountCents / 100, authorization_code: opts.authorization || "AUT" + ref.slice(-3), payment_method_id: opts.brand || "master", payment_type_id: "debit_card", installments: 1, date_created: when, date_approved: when, card: { last_four_digits: opts.last4 || "1111" }, fee_details: [{ type: "mercadopago_fee", amount: 2.22, fee_payer: "collector" }] });
    return ref;
  };
  mp.reject = (orderId) => {
    const o = mp.orders.get(orderId);
    o.status = "failed";
    o.transactions.payments[0].status = "failed";
    o.transactions.payments[0].status_detail = "rejected_by_issuer";
  };

  async function fetcher(url, init = {}) {
    if (state.offline) throw new Error("offline");
    const method = String(init.method || "GET").toUpperCase();
    const headers = init.headers || {};
    const auth = String(headers.Authorization || headers.authorization || "");
    const bearer = auth.replace(/^Bearer /, "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (url.startsWith("https://api.mercadopago.com")) {
      if (bearer !== state.mpToken && bearer !== "APP_USR-owner") return res(401, { code: "unauthorized", message: "invalid token" });
      return mpApi(method, url.slice("https://api.mercadopago.com".length), body);
    }
    if (!url.startsWith(BASE)) return res(404, {});
    const [p, qs = ""] = url.slice(BASE.length).split("?");
    const apikey = String(headers.apikey || "");
    // Como Supabase con claves nuevas: una clave en "Authorization: Bearer" no es JWT y se rechaza.
    if (bearer && (bearer === ANON || bearer === "service")) return res(401, { message: "Invalid JWT" });
    if (apikey !== ANON && apikey !== "service") return res(401, { message: "No API key found in request" });
    const uid = apikey === "service" && !bearer ? "service" : bearer ? tokens.get(bearer) ?? "__bad" : null;
    currentDevice = String(headers["x-device-id"] || "");
    if (uid === "__bad") return res(401, { message: "Invalid JWT" });
    if (p === "/auth/v1/admin/users" && method === "POST") {
      if (uid !== "service") return res(401, { msg: "This endpoint requires a valid service key" });
      if (users.some((u) => u.email === body.email)) return res(422, { error_code: "email_exists", msg: "A user with this email address has already been registered" });
      const u = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, email: body.email, password: body.password };
      users.push(u);
      return res(200, { id: u.id, email: u.email });
    }
    if (p === "/auth/v1/admin/users" && method === "GET") {
      if (uid !== "service") return res(401, { msg: "This endpoint requires a valid service key" });
      return res(200, { users: users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at || new Date().toISOString(), last_sign_in_at: null })) });
    }
    if (p.startsWith("/auth/v1/admin/users/") && method === "DELETE") {
      if (uid !== "service") return res(401, { msg: "This endpoint requires a valid service key" });
      const id = p.split("/").pop();
      const i = users.findIndex((u) => u.id === id);
      if (i < 0) return res(404, { msg: "User not found" });
      users.splice(i, 1);
      // Como en schema.sql 1.3: el integrante se borra; ventas, clientes, cobros y cierres se quedan sin dueño de registro.
      T.members = T.members.filter((m) => m.user_id !== id);
      for (const t of ["sales", "seller_closings"]) for (const r of T[t]) if (r.seller_id === id) r.seller_id = null;
      for (const r of T.customers) if (r.created_by === id) r.created_by = null;
      for (const r of T.terminal_orders) if (r.created_by === id) r.created_by = null;
      for (const [tok, u] of tokens) if (u === id) tokens.delete(tok);
      for (const [tok, u] of refresh) if (u === id) refresh.delete(tok);
      return res(200, {});
    }
    // Recuperar contraseña: correo con código de 6 dígitos (como la plantilla con {{ .Token }}).
    if (p === "/auth/v1/recover" && method === "POST") {
      if (state.smtpBlocked) return res(400, { error_code: "email_address_not_authorized", msg: "Email address not authorized" });
      const u = users.find((x) => x.email === String(body.email || "").toLowerCase());
      if (u) {
        const code = String(100000 + Math.floor(Math.random() * 900000));
        (state.mails = state.mails || []).push({ to: u.email, code });
        u.recovery = code;
      }
      return res(200, {});
    }
    if (p === "/auth/v1/verify" && method === "POST") {
      const u = users.find((x) => x.email === String(body.email || "").toLowerCase());
      if (body.type !== "recovery" || !u || !u.recovery || u.recovery !== String(body.token)) return res(403, { error_code: "otp_expired", msg: "Token has expired or is invalid" });
      u.recovery = null;
      return res(200, issue(u));
    }
    if (p === "/auth/v1/user" && method === "PUT") {
      const u = users.find((x) => x.id === uid);
      if (!u) return res(401, { msg: "invalid JWT" });
      if (String(body.password || "").length < 6) return res(422, { error_code: "weak_password", msg: "weak" });
      if (body.password === u.password) return res(422, { error_code: "same_password", msg: "same" });
      u.password = body.password;
      return res(200, { id: u.id, email: u.email });
    }
    if (p.startsWith("/auth/v1/admin/users/") && method === "PUT") {
      if (uid !== "service") return res(401, { msg: "This endpoint requires a valid service key" });
      const u = users.find((x) => x.id === p.split("/").pop());
      if (!u) return res(404, { msg: "User not found" });
      if (body.password) u.password = body.password;
      return res(200, { id: u.id });
    }
    if (p === "/auth/v1/signup" && state.signupDisabled) return res(422, { error_code: "signup_disabled", msg: "Signups not allowed for this instance" });
    if (p === "/auth/v1/signup") {
      if (users.some((u) => u.email === body.email)) return res(422, { error_code: "user_already_exists", msg: "User already registered" });
      if (String(body.password).length < 6) return res(422, { error_code: "weak_password", msg: "weak" });
      const u = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, email: body.email, password: body.password };
      users.push(u);
      return res(200, issue(u));
    }
    if (p === "/auth/v1/token") {
      const grant = new URLSearchParams(qs).get("grant_type");
      if (grant === "password") {
        const u = users.find((x) => x.email === body.email && x.password === body.password);
        return u ? res(200, issue(u)) : res(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      const id = refresh.get(body.refresh_token);
      if (!id) return res(400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      refresh.delete(body.refresh_token);
      return res(200, issue(users.find((u) => u.id === id)));
    }
    if (p === "/auth/v1/user") return uid && uid !== "service" ? res(200, { id: uid }) : res(401, { msg: "invalid JWT" });
    if (p.startsWith("/rest/v1/rpc/")) return rpc(p.slice(13), body || {}, uid);
    if (p.startsWith("/rest/v1/")) return rest(method, p.slice(9), qs, body, uid, headers.Prefer);
    if (p === "/functions/v1/cobro-terminal") {
      if (!state.functionDeployed) return res(404, { message: "Function not found" });
      const req = new Request(url, { method, headers: { Authorization: auth, "Content-Type": "application/json", "x-device-id": String(headers["x-device-id"] || ""), "x-forwarded-for": state.ip ?? "10.0.0.1" }, body: init.body });
      const r = await fn.handle(req, { url: BASE, serviceKey: "service", mpToken: state.mpToken }, async (u, i = {}) => {
        const out = await fetcher(u, i);
        return new Response(JSON.stringify(await out.json()), { status: out.status });
      });
      const text = await r.text();
      return res(r.status, text ? JSON.parse(text) : null);
    }
    return res(404, {});
  }
  // Para la función: /auth/v1/user con el token del usuario y REST con "service".
  return { fetch: fetcher, T, users, mp, state, failures, BASE, ANON, invite: `NOVA|${BASE}|${ANON}` };
}
module.exports = { createFake, BASE, ANON };
