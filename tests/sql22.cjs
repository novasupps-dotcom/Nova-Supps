// PostgreSQL real embebido en WASM. net.http_post es un stub: no sale ningún aviso.
const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const schema = fs.readFileSync(
  path.join(__dirname, "../supabase/schema.sql"),
  "utf8",
);
const owner = "10000000-0000-4000-8000-000000000001",
  seller = "10000000-0000-4000-8000-000000000002",
  other = "10000000-0000-4000-8000-000000000003";
const token = (n) => "ExponentPushToken[synthetic_token_" + n + "]";
const bootstrap = `
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id bigserial primary key, bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant usage on sequence storage.objects_id_seq to authenticated;
  grant usage on schema auth,public to anon,authenticated;
  create schema net; create table net.calls(id bigserial primary key,url text,body jsonb,headers jsonb);
  create table net.mode(fail boolean); insert into net.mode values(false);
  create function net.http_post(url text,body jsonb,headers jsonb) returns bigint language plpgsql as $$
  declare result bigint; begin
    if (select fail from net.mode) then raise exception 'synthetic network failure'; end if;
    insert into net.calls(url,body,headers) values(url,body,headers) returning id into result;
    return result;
  end $$;
`;

async function run(upgrade) {
  const db = new PGlite();
  try {
    await db.exec(bootstrap);
    if (upgrade) await db.exec(schema.slice(0, schema.indexOf("-- 2.2 ·")));
    await db.exec(schema);
    const q = async (sql, p = []) => (await db.query(sql, p)).rows;
    const as = async (user, device, sql, p = []) => {
      await db.exec("reset role");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,false),set_config('request.headers',$2,false)",
        [user, JSON.stringify({ "x-device-id": device })],
      );
      await db.exec("set role authenticated");
      try {
        return await q(sql, p);
      } finally {
        await db.exec("reset role");
      }
    };
    const calls = async () =>
      (await q("select body from net.calls order by id")).flatMap(
        (r) => r.body,
      );
    const clear = () => db.exec("truncate net.calls");
    await db.query("insert into auth.users values($1),($2),($3)", [
      owner,
      seller,
      other,
    ]);
    await db.query(
      "insert into members(user_id,name,role,active,device_id) values($1,'Dueño','owner',true,'owner-phone')",
      [owner],
    );
    await as(owner, "owner-phone", "select save_push_token($1,'android')", [
      token("owner"),
    ]);
    await db.query(
      "insert into members(user_id,name,role,active,device_id) values($1,'Ana','seller',true,'seller-phone')",
      [seller],
    );
    assert.equal((await calls())[0].data.kind, "member");
    assert.equal((await calls())[0].to, token("owner"));
    await as(seller, "seller-phone", "select save_push_token($1,'android')", [
      token("seller"),
    ]);
    await db.exec(
      "insert into catalog(product_id,name,price,available) values('product-one','Producto',12000,100)",
    );
    const submit = (id) =>
      as(
        seller,
        "seller-phone",
        'select submit_sale($1,\'[{"productId":"product-one","qty":1}]\',\'Efectivo\') result',
        [id],
      );
    await assert.rejects(
      as(seller, "wrong-phone", "select save_push_token($1,'android')", [
        token("invalid-device"),
      ]),
      /no está autorizado/,
    );
    await assert.rejects(
      as(seller, "seller-phone", "select save_push_token('invalid','android')"),
      /inválido/,
    );
    await assert.rejects(
      as(seller, "wrong-phone", "select delete_push_token()"),
      /no está autorizado/,
    );
    await assert.rejects(
      as(seller, "seller-phone", "select * from push_tokens"),
      /permission denied/,
    );
    await assert.rejects(
      as(seller, "seller-phone", "select send_push(array[$1::uuid],'X','Y')", [
        owner,
      ]),
      /permission denied/,
    );
    assert.equal(
      (
        await q(
          "select has_function_privilege('anon','public.save_push_token(text,text)','execute') as allowed",
        )
      )[0].allowed,
      false,
    );
    assert.equal(
      (
        await q(
          "select has_function_privilege('authenticated','public.send_push(uuid[],text,text,jsonb)','execute') as allowed",
        )
      )[0].allowed,
      false,
    );
    await clear();
    const sale = (await submit("sale-one"))[0].result;
    let sent = await calls();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, token("owner"));
    assert.equal(sent[0].data.kind, "sale");
    assert.ok(sent[0].body.includes((sale.total / 100).toFixed(2)));
    await clear();
    await as(
      owner,
      "owner-phone",
      "update sales set status='conflicto',error='Revisar stock' where id='sale-one'",
    );
    assert.match((await calls())[0].title, /revisión/);
    await clear();
    await as(
      owner,
      "owner-phone",
      "update sales set status='rechazada' where id='sale-one'",
    );
    assert.equal((await calls())[0].to, token("seller"));
    assert.equal((await calls())[0].data.kind, "sale_rejected");
    await clear();
    await as(
      owner,
      "owner-phone",
      "update sales set status='rechazada',error='Otra nota' where id='sale-one'",
    );
    assert.equal((await calls()).length, 0);
    await db.query(
      "insert into seller_closings(seller_id,seller_name,sales_count,units,total,by_method,items) values($1,'Ana',2,2,25000,'{}','[]')",
      [seller],
    );
    assert.equal((await calls())[0].data.kind, "closing");
    await clear();
    await db.query(
      "update members set device_id='owner-new-phone' where user_id=$1",
      [owner],
    );
    await submit("old-phone");
    assert.equal(
      (await calls()).length,
      0,
      "teléfono anterior no recibe avisos",
    );
    await as(owner, "owner-new-phone", "select save_push_token($1,'android')", [
      token("new-owner"),
    ]);
    await db.exec("update net.mode set fail=true");
    await submit("send-fails");
    assert.equal(
      (await q("select count(*)::int n from sales where id='send-fails'"))[0].n,
      1,
      "falla de envío conserva la venta",
    );
    await db.exec("update net.mode set fail=false");
    await as(seller, "seller-phone", "select delete_push_token()");
    assert.equal(
      (
        await q("select count(*)::int n from push_tokens where user_id=$1", [
          seller,
        ])
      )[0].n,
      0,
    );
    // 2.5 · Catálogo en PDF: solo el dueño sube al espacio público "catalogos".
    assert.equal((await q("select public from storage.buckets where id='catalogos'"))[0].public, true);
    await as(owner, "owner-phone", "insert into storage.objects(bucket_id,name) values('catalogos','catalogo-1.pdf')");
    await assert.rejects(
      as(seller, "seller-phone", "insert into storage.objects(bucket_id,name) values('catalogos','catalogo-2.pdf')"),
      /row-level security/,
    );
    const count = (await q("select count(*)::int n from sales"))[0].n;
    await db.exec(schema);
    assert.equal(
      (await q("select count(*)::int n from sales"))[0].n,
      count,
      "SQL repetible conserva datos",
    );
    console.log(
      "  ✓ SQL 2.2: " +
        (upgrade ? "actualización desde 2.1" : "instalación nueva") +
        "; triggers, RLS, teléfono anterior, desactivación y envío fallido",
    );
  } finally {
    await db.close();
  }
}
(async () => {
  await run(false);
  await run(true);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
