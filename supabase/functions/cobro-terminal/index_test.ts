(globalThis as any).__NOVA_TEST__ = true;
const { handle } = await import("./index.ts");
const calls: string[] = [];
let claimed = false;
const keys: string[] = [];
const deleted: string[] = [];
const passwords: string[] = [];
const who: { role: string; methods?: string[] } = { role: "seller" };
const orders: any[] = [{ order_id: "ORD9", created_by: "otro", amount: 100, status: "creada" }];
const mode = { value: "PDV" };
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const pays: any[] = [
  { id: 501, status: "approved", operation_type: "pos_payment", transaction_amount: 469, date_created: ago(2), payment_method_id: "visa", card: { last_four_digits: "4242" }, authorization_code: "111111" },
  { id: 502, status: "approved", operation_type: "regular_payment", transaction_amount: 469, date_created: ago(3) },
  { id: 503, status: "rejected", operation_type: "pos_payment", transaction_amount: 469, date_created: ago(1) },
  { id: 504, status: "approved", operation_type: "pos_payment", transaction_amount: 469, date_created: ago(1600) },
  { id: 505, status: "approved", operation_type: "pos_payment", external_reference: "NOVA-abc-123", transaction_amount: 469, date_created: ago(1) },
  { id: 506, status: "approved", point_of_interaction: { type: "POINT" }, transaction_amount: 120, date_created: ago(1) },
];
const fake = async (url: string, init: any = {}) => {
  calls.push(url);
  if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }), { status: init.headers.Authorization === "Bearer good" ? 200 : 401 });
  if (url.includes("/rest/v1/members?select=user_id,role,name")) return new Response(JSON.stringify([{ user_id: "u1", role: who.role, name: "Yo" }, { user_id: "00000000-0000-4000-8000-000000000002", role: "seller", name: "Luis" }, { user_id: "00000000-0000-4000-8000-000000000009", role: "owner", name: "Otro" }]));
  if (url.includes("/rest/v1/members")) return new Response(JSON.stringify([{ role: who.role, name: "Luis", device_id: "dev1", methods: who.methods }]));
  if (url.includes("/auth/v1/admin/users?")) return new Response(JSON.stringify({ users: [{ id: "u1", email: "yo@x.mx" }, { id: "00000000-0000-4000-8000-000000000002", email: "luis@x.mx" }] }));
  if (/\/auth\/v1\/admin\/users\/[0-9a-f-]+$/.test(url) && init.method === "DELETE") { deleted.push(url.split("/").pop()!); return new Response("{}"); }
  if (/\/auth\/v1\/admin\/users\/[0-9a-f-]+$/.test(url) && init.method === "PUT") { passwords.push(JSON.parse(init.body).password); return new Response("{}"); }
  if (url.includes("/rest/v1/config")) return new Response(JSON.stringify([{ value: { terminalId: "T1", enabled: true } }]));
  if (url.endsWith("/rpc/invite_claim")) { const b = JSON.parse(init.body); keys.push(b.p_key); if (b.p_code !== "GNSABCDEFGH") return new Response('"invalid"'); if (claimed) return new Response('"used"'); claimed = true; return new Response('"ok"'); }
  if (url.endsWith("/rpc/invite_finish")) return new Response('"active"');
  if (url.endsWith("/rpc/invite_release")) { claimed = false; return new Response("null"); }
  if (url.endsWith("/auth/v1/admin/users")) { const b = JSON.parse(init.body); return b.email === "ya@x.mx" ? new Response(JSON.stringify({ msg: "already registered" }), { status: 422 }) : new Response(JSON.stringify({ id: "new-user" })); }
  if (url.includes("/rest/v1/terminal_orders")) {
    if (init.method === "POST") { orders.push(JSON.parse(init.body)); return new Response("[]", { status: 201 }); }
    if (init.method === "PATCH") { const id = decodeURIComponent(url.split("order_id=eq.")[1]); Object.assign(orders.find((o) => o.order_id === id), JSON.parse(init.body)); return new Response("[]"); }
    const inList = /reference=in\.\(([^)]*)\)/.exec(url);
    if (inList) { const ids = inList[1].split(",").map(decodeURIComponent); return new Response(JSON.stringify(orders.filter((o) => ids.includes(String(o.reference))))); }
    const m = /order_id=eq\.([^&]+)/.exec(url) || /reference=eq\.([^&]+)/.exec(url);
    const key = url.includes("order_id=eq.") ? "order_id" : "reference";
    return new Response(JSON.stringify(orders.filter((o) => o[key] === decodeURIComponent(m![1]))));
  }
  if (url.includes("/terminals/v1/list")) return new Response(JSON.stringify({ data: { terminals: [{ id: "T1", operating_mode: mode.value }] } }));
  if (url.includes("/v1/payments/search")) return new Response(JSON.stringify({ results: pays }));
  if (/\/v1\/payments\/\d+$/.test(url)) { const p = pays.find((x) => String(x.id) === url.split("/").pop()); return p ? new Response(JSON.stringify(p)) : new Response("{}", { status: 404 }); }
  if (/\/v1\/orders\/ORD[0-9]+$/.test(url)) return new Response(JSON.stringify({ id: url.split("/").pop(), status: "processed", transactions: { payments: [{ status: "processed", amount: "469.00", reference_id: "777" }] } }));
  if (url.endsWith("/v1/orders")) { const b = JSON.parse(init.body); return new Response(JSON.stringify({ id: "ORD1", amount: b.transactions.payments[0].amount, t: b.config.point.terminal_id }), { status: 201 }); }
  return new Response("{}", { status: 404 });
};
const env = { url: "https://x.supabase.co", serviceKey: "sb_secret_abc", mpToken: "APP_USR-1" };
const req = (body: unknown, auth = "Bearer good", device = "dev1") => new Request("https://x/functions/v1/cobro-terminal", { method: "POST", headers: { Authorization: auth, "x-device-id": device }, body: JSON.stringify(body) });
const alta = (code: string, email = "luis@x.mx") => handle(req({ action: "alta", code, name: "Luis", email, password: "secreto22", device: "dev-luis-0123456789" }, ""), env, fake as any);
Deno.test("crea cobro en la terminal del dueño desde el teléfono registrado", async () => {
  const r = await handle(req({ action: "create", amount: 46900, reference: "NOVA-abc-123" }), env, fake as any);
  const j = await r.json();
  if (r.status !== 201 || j.amount !== "469.00" || j.t !== "T1") throw new Error(JSON.stringify(j));
});
Deno.test("rechaza sin sesión, otro teléfono y acciones no permitidas", async () => {
  if ((await handle(req({ action: "ping" }, "Bearer bad"), env, fake as any)).status !== 401) throw new Error("401");
  if ((await handle(req({ action: "ping" }, "Bearer good", "otro"), env, fake as any)).status !== 403) throw new Error("otro teléfono");
  if ((await handle(req({ action: "refund", orderId: "ORD1" }), env, fake as any)).status !== 400) throw new Error("refund");
  if ((await handle(req({ action: "create", amount: 5, reference: "NOVA-abc-123" }), env, fake as any)).status !== 400) throw new Error("amount");
});
Deno.test("alta solo con código válido y de un solo uso", async () => {
  if ((await alta("GNS-ZZZZ-ZZZZ")).status !== 400) throw new Error("inválido");
  const dup = await alta("GNS-ABCD-EFGH", "ya@x.mx");
  if (dup.status !== 409 || claimed) throw new Error("correo repetido debe liberar el código");
  if ((await alta("gns-abcd-efgh")).status !== 200) throw new Error("alta");
  const again = await alta("GNSABCDEFGH", "otro@x.mx");
  if ((await again.json()).code !== "used") throw new Error("reuso");
});

Deno.test("solo quien creó el cobro lo consulta; el servidor marca aprobado", async () => {
  const r = await handle(req({ action: "create", amount: 46900, reference: "NOVA-xyz-123" }), env, fake as any);
  const id = (await r.json()).id;
  if (!orders.some((o) => o.order_id === id && o.created_by === "u1")) throw new Error("no registró");
  const g = await handle(req({ action: "get", orderId: id }), env, fake as any);
  if (g.status !== 200 || orders.find((o) => o.order_id === id).status !== "aprobada") throw new Error("no aprobó");
  if ((await handle(req({ action: "get", orderId: "ORD9" }), env, fake as any)).status !== 403) throw new Error("ajeno get");
  if ((await handle(req({ action: "cancel", orderId: "ORD9" }), env, fake as any)).status !== 403) throw new Error("ajeno cancel");
});
Deno.test("sin dirección conocida no usa un contador compartido", async () => {
  keys.length = 0;
  await alta("GNS-ZZZZ-ZZZZ");
  if (keys[0] !== "") throw new Error("debe mandar clave vacía, no un valor compartido: " + keys[0]);
  await handle(new Request("https://x/functions/v1/cobro-terminal", { method: "POST", headers: { "x-forwarded-for": "8.8.8.8, 10.0.0.1" }, body: JSON.stringify({ action: "alta", code: "GNS-ZZZZ-ZZZZ", name: "L", email: "l@x.mx", password: "secreto22", device: "dev-luis-0123456789" }) }), env, fake as any);
  if (keys[1] !== "8.8.8.8") throw new Error("usa la IP del cliente: " + keys[1]);
});
Deno.test("1.3: solo el dueño ve correos y elimina vendedores (nunca al dueño)", async () => {
  who.role = "seller";
  if ((await handle(req({ action: "usuarios" }), env, fake as any)).status !== 403) throw new Error("vendedor no ve usuarios");
  if ((await handle(req({ action: "eliminar_usuario", userId: "00000000-0000-4000-8000-000000000002" }), env, fake as any)).status !== 403) throw new Error("vendedor no elimina");
  who.role = "owner";
  const list = await (await handle(req({ action: "usuarios" }), env, fake as any)).json();
  if (list.users.length !== 1 || list.users[0].email !== "luis@x.mx" || !list.users[0].member) throw new Error("lista sin el dueño: " + JSON.stringify(list));
  if ((await handle(req({ action: "eliminar_usuario", userId: "00000000-0000-4000-8000-000000000009" }), env, fake as any)).status !== 403) throw new Error("no borra a un dueño");
  if ((await handle(req({ action: "eliminar_usuario", userId: "u1" }), env, fake as any)).status !== 400) throw new Error("id inválido");
  const ok = await handle(req({ action: "eliminar_usuario", userId: "00000000-0000-4000-8000-000000000002" }), env, fake as any);
  if (ok.status !== 200 || deleted.at(-1) !== "00000000-0000-4000-8000-000000000002") throw new Error("elimina al vendedor");
  who.role = "seller";
});
Deno.test("1.3: vendedor sin tarjeta habilitada no puede crear cobros", async () => {
  who.methods = ["Efectivo"];
  const r = await handle(req({ action: "create", amount: 46900, reference: "NOVA-abc-999" }), env, fake as any);
  who.methods = undefined;
  if (r.status !== 403) throw new Error("debe rechazar: " + r.status);
});
Deno.test("1.4: solo el dueño pone contraseña nueva a un vendedor", async () => {
  const body = { action: "cambiar_contrasena", userId: "00000000-0000-4000-8000-000000000002", password: "temporal-123" };
  who.role = "seller";
  if ((await handle(req(body), env, fake as any)).status !== 403) throw new Error("vendedor no");
  who.role = "owner";
  if ((await handle(req({ ...body, password: "corta" }), env, fake as any)).status !== 400) throw new Error("mínimo 8");
  if ((await handle(req({ ...body, userId: "00000000-0000-4000-8000-000000000009" }), env, fake as any)).status !== 403) throw new Error("no al dueño");
  const ok = await handle(req(body), env, fake as any);
  if (ok.status !== 200 || passwords.at(-1) !== "temporal-123") throw new Error("cambia la contraseña");
  who.role = "seller";
});

Deno.test("2.0.3: terminal en modo normal → no se manda el cobro; se busca y se liga el pago", async () => {
  mode.value = "STANDALONE";
  const c = await handle(req({ action: "create", amount: 46900, reference: "NOVA-std-123" }), env, fake as any);
  const cj = await c.json();
  if (c.status !== 409 || cj.code !== "terminal_not_pdv") throw new Error("debe avisar modo normal: " + JSON.stringify(cj));
  mode.value = "PDV";
  const f = await (await handle(req({ action: "buscar_pago", amount: 46900, since: ago(10) }), env, fake as any)).json();
  if (f.payments.length !== 1 || f.payments[0].id !== "501" || f.payments[0].last4 !== "4242" || f.other !== 1) throw new Error("solo el de terminal, aprobado, reciente y no enviado por la app: " + JSON.stringify(f));
  const u = await handle(req({ action: "usar_pago", paymentId: "501", amount: 46900 }), env, fake as any);
  const uj = await u.json();
  if (u.status !== 200 || uj.orderId !== "PAY-501" || !orders.some((o) => o.order_id === "PAY-501" && o.status === "aprobada" && o.created_by === "u1" && o.amount === 46900)) throw new Error("liga: " + JSON.stringify(uj));
  if ((await handle(req({ action: "usar_pago", paymentId: "501", amount: 46900 }), env, fake as any)).status !== 200) throw new Error("reintento del mismo vendedor");
  const again = await (await handle(req({ action: "buscar_pago", amount: 46900, since: ago(10) }), env, fake as any)).json();
  if (again.payments.length) throw new Error("ya usado no aparece");
  orders.find((o) => o.order_id === "PAY-501").created_by = "otro";
  if ((await handle(req({ action: "usar_pago", paymentId: "501", amount: 46900 }), env, fake as any)).status !== 409) throw new Error("de otro vendedor");
  for (const [id, amt] of [["502", 46900], ["503", 46900], ["504", 46900], ["505", 46900], ["506", 46900]])
    if ((await handle(req({ action: "usar_pago", paymentId: id, amount: amt }), env, fake as any)).status !== 409) throw new Error("rechaza " + id);
  if ((await handle(req({ action: "usar_pago", paymentId: "506", amount: 12000 }), env, fake as any)).status !== 200) throw new Error("POINT por punto de interacción");
  who.methods = ["Efectivo"];
  const no = await handle(req({ action: "buscar_pago", amount: 46900 }), env, fake as any);
  who.methods = undefined;
  if (no.status !== 403) throw new Error("sin tarjeta no busca");
});
