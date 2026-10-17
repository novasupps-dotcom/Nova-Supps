import React from "react";
import { Alert, Switch, View } from "react-native";
import { Text, TextInput } from "../text";
import { localDay, money, type Row } from "../business";
import { formatShortCode } from "../cloud";
import { loginHere } from "../login";
import { detachPush } from "../push";
import { storeCloud } from "../storeConfig";
import {
  NEEDS_SCHEMA_21,
  SCHEMA_21_NOTE,
  NEEDS_SCAN_SCHEMA,
  SCAN_SCHEMA_NOTE,
} from "../sync";
import { type TransferAccount } from "../transfer";
import {
  Button,
  C,
  Card,
  Chips,
  Note,
  Pill,
  fmtDay,
  s,
} from "../ui";
import type { Body, OwnerPageContext } from "./ownerContext";

export function renderTeamPage(ctx: OwnerPageContext): Body | null {
  if (!["Equipo"].includes(ctx.page)) return null;
  const {
    data,
    page,
    b,
    cloudStatus,
    mpCfg,
    errText,
    mpClient,
    refresh,
    getCloud,
    cloudForm,
    setCloudForm,
    teamData,
    teamMsg,
    teamBusy,
    connectOwner,
    runSync,
    ownerElsewhere,
    teamAction,
    cloudRef,
    ownerBound,
    setOwnerElsewhere,
    emailOf,
    setTeamMsg,
    sellerCuts,
    setSellerCuts,
    pwFor,
    setPwFor,
    deleteUser,
    createInvite,
    newInvite,
    shareInvite,
    setTeamData,
    setCloudStatus,
  } = ctx;
  const d = data!;
  const {
    accounts,
  } = d;
  if (page === "Equipo") {
    const cfg = b!.setting("cloudConfig", null);
    const cloud = getCloud();
    const connected = !!cloud?.session;
    const accountsMap: Row = b!.setting("sellerAccounts", {});
    const sellerTerminal = !!b!.setting("sellerTerminal", false);
    const cf = (
      key: string,
      label: string,
      opts: { secure?: boolean; placeholder?: string; kind?: any } = {},
    ) => (
      <View style={s.field} key={key}>
        <Text style={s.label}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          style={s.input}
          value={cloudForm[key] || ""}
          onChangeText={(v) => setCloudForm((x) => ({ ...x, [key]: v }))}
          secureTextEntry={opts.secure}
          placeholder={opts.placeholder}
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={opts.kind}
        />
      </View>
    );
    const members = teamData?.members || [];
    const sellers = members.filter((m) => m.role === "seller");
    const conflicts = teamData?.conflicts || [];
    return {
      scroll: (
        <>
          {!!teamMsg && (
            <Card tone={teamMsg.tone}>
              <Text style={s.body}>{teamMsg.text}</Text>
            </Card>
          )}
          {!connected ? (
            <>
              <Card>
                <Text style={s.subtitle}>Vende con varios teléfonos</Text>
                <Note>Tus vendedores venden desde su celular con esta app. Sus ventas llegan a este teléfono, que es la caja central.</Note>
                <Note>Crea tu base gratuita en supabase.com (guía «Configurar vendedores») y pega aquí la URL del proyecto y la clave pública.</Note>
              </Card>
              <Text style={s.section}>Conectar este teléfono como dueño</Text>
              <Card>
                <Note>{`La app ya trae la base de tu tienda (${storeCloud().url.replace("https://", "")}). Solo cambia la URL y la clave si usarás otra.`}</Note>
                {cf("url", "URL del proyecto (opcional)", {
                  placeholder: storeCloud().url,
                })}
                {cf("key", "Clave pública (opcional)", {
                  placeholder: "sb_publishable_…",
                })}
                {cf("name", "Tu nombre", { placeholder: "Emmanuel" })}
                {cf("email", "Tu correo *", {
                  placeholder: "dueño@correo.com",
                  kind: "email-address",
                })}
                {cf("password", "Contraseña (mínimo 6) *", { secure: true })}
                <Button
                  title={teamBusy ? "Conectando…" : "Crear cuenta de dueño"}
                  disabled={teamBusy}
                  onPress={() => void connectOwner("signup")}
                />
                <Button
                  title="Ya tengo cuenta · Entrar"
                  secondary
                  disabled={teamBusy}
                  onPress={() => void connectOwner("signin")}
                />
                <Note>
                  ¿Ya tienes cuenta de dueño? Escribe solo tu correo y
                  contraseña y toca Entrar: este teléfono quedará como el del
                  dueño.
                </Note>
              </Card>
            </>
          ) : (
            <>
              <Card tone={cloudStatus && !cloudStatus.ok ? "bad" : "ok"}>
                <View style={s.between}>
                  <Text style={[s.subtitle, { flex: 1 }]}>Base en línea</Text>
                  <Pill
                    text={
                      cloudStatus
                        ? cloudStatus.ok
                          ? "Conectada"
                          : "Con error"
                        : "Conectada"
                    }
                    tone={cloudStatus && !cloudStatus.ok ? "bad" : "ok"}
                  />
                </View>
                <Note>{`${cloud!.session?.user?.email || ""} · ${cfg?.url || ""}`}</Note>
                <Note>
                  {cloudStatus?.at
                    ? `Última sincronización: ${new Date(cloudStatus.at).toLocaleTimeString("es-MX")}`
                    : "Se sincroniza sola cada minuto mientras la app está abierta."}
                </Note>
                {!!cloudStatus && !cloudStatus.ok && (
                  <Note color={C.red}>{cloudStatus.text}</Note>
                )}
                {b!.setting(NEEDS_SCAN_SCHEMA, null) === true && (
                  <Note color={C.amber}>{SCAN_SCHEMA_NOTE}</Note>
                )}
                {b!.setting(NEEDS_SCHEMA_21, null) === true && (
                  <Note color={C.amber}>{SCHEMA_21_NOTE}</Note>
                )}
                <Button
                  icon="refresh-cw" title={teamBusy ? "Sincronizando…" : "Sincronizar ahora"}
                  disabled={teamBusy}
                  onPress={() => void runSync(true)}
                />
              </Card>
              {ownerElsewhere && (
                <Card tone="bad">
                  <Text style={s.subtitle}>
                    Tu cuenta de dueño se abrió en otro teléfono
                  </Text>
                  <Note>
                    Si este es el teléfono del negocio, escribe tu contraseña
                    para volver a usarlo como dueño. El otro teléfono dejará de
                    serlo.
                  </Note>
                  {cf("relogin", "Tu contraseña", { secure: true })}
                  <Button
                    title="Usar este teléfono como dueño"
                    disabled={teamBusy}
                    onPress={() =>
                      void teamAction(async () => {
                        const email = getCloud()?.session?.user?.email || "";
                        const st = await loginHere(
                          b!,
                          email,
                          cloudForm.relogin || "",
                        );
                        if (st !== "owner")
                          throw new Error("Esa cuenta no es la del dueño.");
                        cloudRef.current = null;
                        ownerBound.current = false;
                        setCloudForm((x) => ({ ...x, relogin: "" }));
                        setOwnerElsewhere(false);
                        await runSync(true);
                      }, "Listo: este teléfono volvió a ser el del dueño.")
                    }
                  />
                </Card>
              )}
              {!!conflicts.length && (
                <>
                  <Text style={s.section}>
                    Ventas de vendedores por revisar
                  </Text>
                  {conflicts.map((v: Row) => (
                    <Card key={v.id} tone="warn">
                      <Text
                        style={s.subtitle}
                      >{`${v.seller_name || "Vendedor"} · ${money(v.total)} · ${v.method}`}</Text>
                      <Note>{`${fmtDay(localDay(v.created_at))} · ${(v.items as Row[]).map((i) => `${i.qty} × ${i.name || i.productId}`).join(", ")}`}</Note>
                      <Note color={C.red}>{v.error || "Sin detalle"}</Note>
                      <View style={s.wrap}>
                        <Button
                          title="Reintentar"
                          small
                          onPress={() =>
                            void teamAction(
                              async () => (
                                await getCloud()!.update(
                                  "sales",
                                  `id=eq.${encodeURIComponent(v.id)}`,
                                  { status: "pendiente", error: null },
                                ),
                                await runSync()
                              ),
                              "Venta enviada a registrar de nuevo",
                            )
                          }
                        />
                        <Button
                          title="Descartar"
                          danger
                          small
                          onPress={() =>
                            Alert.alert(
                              "Descartar venta del vendedor",
                              v.mp?.orderId
                                ? "Se cobró con tarjeta: si la descartas, devuelve el cobro desde la app de Mercado Pago o con el botón Devolver."
                                : "No se registrará en tu inventario ni en tus ventas.",
                              [
                                { text: "Volver", style: "cancel" },
                                ...(v.mp?.orderId && mpCfg
                                  ? [
                                      {
                                        text: "Devolver y descartar",
                                        style: "destructive" as const,
                                        onPress: () =>
                                          void teamAction(
                                            async () => (
                                              await mpClient().refundOrder(
                                                v.mp.orderId,
                                              ),
                                              await getCloud()!.update(
                                                "sales",
                                                `id=eq.${encodeURIComponent(v.id)}`,
                                                { status: "rechazada" },
                                              )
                                            ),
                                            "Cobro devuelto y venta descartada",
                                          ),
                                      },
                                    ]
                                  : []),
                                {
                                  text: "Descartar",
                                  style: "destructive",
                                  onPress: () =>
                                    void teamAction(
                                      () =>
                                        getCloud()!.update(
                                          "sales",
                                          `id=eq.${encodeURIComponent(v.id)}`,
                                          { status: "rechazada" },
                                        ),
                                      "Venta descartada",
                                    ),
                                },
                              ],
                            )
                          }
                        />
                      </View>
                    </Card>
                  ))}
                  <Note>
                    Lo más común: faltan existencias. Registra una Entrada o
                    ajusta el conteo y toca Reintentar.
                  </Note>
                </>
              )}
              <Text style={s.section}>Vendedores</Text>
              <Card>
                {!sellers.length && (
                  <Note>
                    Aún no hay vendedores. Crea un código de invitación abajo.
                  </Note>
                )}
                {sellers.map((m) => (
                  <View
                    key={m.user_id}
                    style={[s.cartRow, { flexWrap: "wrap" }]}
                  >
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={[s.body, { fontWeight: "700" }]}>
                        {m.name}
                      </Text>
                      <Note>
                        {m.active
                          ? "Activo · solo puede vender"
                          : "En pausa / pendiente"}
                      </Note>
                      <Note color={m.device_id ? C.muted : C.amber}>
                        {m.device_id
                          ? `Teléfono registrado${m.device_at ? ` el ${fmtDay(localDay(m.device_at))}` : ""}`
                          : "Esperando que entre en su teléfono nuevo"}
                      </Note>
                    </View>
                    <View style={{ width: "100%" }}>
                      {!!emailOf(m.user_id) && (
                        <Note>{`${emailOf(m.user_id)}`}</Note>
                      )}
                      <Text style={[s.label, { marginTop: 6 }]}>
                        Puede cobrar con
                      </Text>
                      <View style={s.wrap}>
                        {(
                          ["Tarjeta", "Efectivo", "Transferencia"] as const
                        ).map((meth) => {
                          const list: string[] = Array.isArray(m.methods)
                            ? m.methods
                            : ["Tarjeta", "Efectivo", "Transferencia"];
                          const on = list.includes(meth);
                          return (
                            <Button
                              key={meth}
                              title={`${on ? "✓ " : ""}${meth === "Tarjeta" ? "Tarjeta (terminal)" : meth}`}
                              secondary={!on}
                              small
                              onPress={() => {
                                const next = on
                                  ? list.filter((x) => x !== meth)
                                  : [
                                      "Tarjeta",
                                      "Efectivo",
                                      "Transferencia",
                                    ].filter(
                                      (x) => x === meth || list.includes(x),
                                    );
                                if (!next.length)
                                  return setTeamMsg({
                                    text: "Deja al menos una forma de pago.",
                                    tone: "bad",
                                  });
                                void teamAction(
                                  () =>
                                    getCloud()!.update(
                                      "members",
                                      `user_id=eq.${m.user_id}`,
                                      { methods: next },
                                    ),
                                  `${m.name}: ${next.join(", ")}`,
                                );
                              }}
                            />
                          );
                        })}
                      </View>
                      <Note>
                        La tarjeta (terminal) es la forma de pago que el
                        vendedor ve elegida al vender.
                      </Note>
                      <Text style={[s.label, { marginTop: 6 }]}>
                        Datos de transferencia que ve
                      </Text>
                      {(() => {
                        const all: TransferAccount[] = b!.setting(
                          "transferAccounts",
                          [],
                        );
                        if (!all.length)
                          return (
                            <Note>
                              Captura tus datos en Ajustes → Formas de pago.
                            </Note>
                          );
                        const ids: string[] = Array.isArray(m.transfer_ids)
                          ? m.transfer_ids
                          : all.map((a) => a.id);
                        return (
                          <View style={s.wrap}>
                            {all.map((a) => {
                              const on = ids.includes(a.id);
                              return (
                                <Button
                                  key={a.id}
                                  title={`${on ? "✓ " : ""}${a.label}`}
                                  secondary={!on}
                                  small
                                  onPress={() => {
                                    const next = on
                                      ? ids.filter((x) => x !== a.id)
                                      : [...ids, a.id];
                                    void teamAction(
                                      () =>
                                        getCloud()!.update(
                                          "members",
                                          `user_id=eq.${m.user_id}`,
                                          { transfer_ids: next },
                                        ),
                                      `${m.name} verá: ${
                                        next
                                          .map(
                                            (x) =>
                                              all.find((y) => y.id === x)
                                                ?.label,
                                          )
                                          .filter(Boolean)
                                          .join(", ") || "ningún dato"
                                      }`,
                                    );
                                  }}
                                />
                              );
                            })}
                          </View>
                        );
                      })()}
                    </View>
                    <Button
                      icon="calculator" title={
                        sellerCuts?.userId === m.user_id
                          ? "Ocultar cierres"
                          : "Cierres de caja"
                      }
                      secondary
                      small
                      onPress={() =>
                        sellerCuts?.userId === m.user_id
                          ? setSellerCuts(null)
                          : void teamAction(async () =>
                              setSellerCuts({
                                userId: m.user_id,
                                rows: await getCloud()!.select(
                                  "seller_closings",
                                  `select=*&seller_id=eq.${m.user_id}&order=created_at.desc&limit=20`,
                                ),
                              }),
                            )
                      }
                    />
                    {sellerCuts?.userId === m.user_id && (
                      <View style={{ width: "100%" }}>
                        {!sellerCuts!.rows.length && (
                          <Note>Aún no cierra caja.</Note>
                        )}
                        {sellerCuts!.rows.map((c: Row) => (
                          <Card key={c.id}>
                            <View style={s.between}>
                              <Text
                                style={[s.body, { fontWeight: "700", flex: 1 }]}
                              >{`${fmtDay(localDay(c.created_at))} · ${new Date(c.created_at).toTimeString().slice(0, 5)}`}</Text>
                              <Text style={s.price}>{money(c.total)}</Text>
                            </View>
                            <Note>{`${c.sales_count} ventas · ${c.units} unidades · ${Object.entries(
                              c.by_method || {},
                            )
                              .map(([k, v]) => `${k} ${money(Number(v) || 0)}`)
                              .join(" · ")}`}</Note>
                            {(c.items as Row[]).map((i) => (
                              <Text
                                key={i.productId}
                                style={s.body}
                              >{`${i.qty} × ${i.name || i.productId} · ${money(i.total)}`}</Text>
                            ))}
                            {c.card_fee > 0 && (
                              <Note>{`Incluye comisión absorbida por clientes: ${money(c.card_fee)}`}</Note>
                            )}
                            {c.review_count > 0 && (
                              <Note
                                color={C.amber}
                              >{`${c.review_count} en revisión`}</Note>
                            )}
                          </Card>
                        ))}
                      </View>
                    )}
                    {m.active ? (
                      <>
                        <Button
                          title="Desactivar"
                          secondary
                          small
                          onPress={() =>
                            void teamAction(
                              () =>
                                getCloud()!.update(
                                  "members",
                                  `user_id=eq.${m.user_id}`,
                                  { active: false },
                                ),
                              `${m.name} ya no puede vender`,
                            )
                          }
                        />
                      </>
                    ) : (
                      <>
                        <Button
                          title="Activar"
                          small
                          onPress={() =>
                            void teamAction(
                              () =>
                                getCloud()!.update(
                                  "members",
                                  `user_id=eq.${m.user_id}`,
                                  { active: true },
                                ),
                              `${m.name} ya puede vender`,
                            )
                          }
                        />
                      </>
                    )}
                    <Button
                      icon="key-round" title={
                        pwFor?.userId === m.user_id
                          ? "Cancelar contraseña"
                          : "Nueva contraseña"
                      }
                      secondary
                      small
                      onPress={() =>
                        setPwFor(
                          pwFor?.userId === m.user_id
                            ? null
                            : { userId: m.user_id, value: "" },
                        )
                      }
                    />
                    <Button
                      icon="trash-2" title="Eliminar usuario"
                      danger
                      small
                      onPress={() =>
                        deleteUser(m.user_id, m.name, emailOf(m.user_id))
                      }
                    />
                    {pwFor?.userId === m.user_id && (
                      <View style={{ width: "100%" }}>
                        <Note>
                          Si no le llega el correo para recuperar su contraseña,
                          pon una nueva aquí y díselo en persona.
                        </Note>
                        <TextInput
                          accessibilityLabel={`Contraseña nueva de ${m.name}`}
                          style={s.input}
                          value={pwFor!.value}
                          onChangeText={(v) =>
                            setPwFor({ userId: m.user_id, value: v })
                          }
                          secureTextEntry
                          autoCapitalize="none"
                          autoCorrect={false}
                          placeholder="Mínimo 8 caracteres"
                          placeholderTextColor={C.muted}
                        />
                        <Button
                          title="Guardar contraseña"
                          small
                          disabled={teamBusy}
                          onPress={() =>
                            void teamAction(async () => {
                              if ((pwFor!.value || "").length < 8)
                                throw new Error(
                                  "La contraseña debe tener al menos 8 caracteres.",
                                );
                              const r = await getCloud()!.invoke(
                                "cobro-terminal",
                                {
                                  action: "cambiar_contrasena",
                                  userId: m.user_id,
                                  password: pwFor!.value,
                                },
                              );
                              if (!r.ok)
                                throw new Error(
                                  r.data?.message ||
                                    `No se pudo cambiar (${r.status}).`,
                                );
                              setPwFor(null);
                            }, `Contraseña de ${m.name} cambiada.`)
                          }
                        />
                      </View>
                    )}
                  </View>
                ))}
                {!!teamData?.users && teamData.users.some((u) => !u.member) && (
                  <>
                    <Text style={[s.label, { marginTop: 12 }]}>
                      Cuentas sin acceso a la tienda
                    </Text>
                    {teamData.users
                      .filter((u) => !u.member)
                      .map((u) => (
                        <View
                          key={u.id}
                          style={[s.cartRow, { flexWrap: "wrap" }]}
                        >
                          <View style={{ flex: 1, minWidth: 150 }}>
                            <Text style={s.body}>{u.email || u.id}</Text>
                            <Note>
                              {u.created_at
                                ? `Creada el ${fmtDay(localDay(u.created_at))}`
                                : ""}
                            </Note>
                          </View>
                          <Button
                            icon="trash-2" title="Eliminar"
                            danger
                            small
                            onPress={() =>
                              deleteUser(
                                u.id,
                                u.email || "esta cuenta",
                                u.email,
                              )
                            }
                          />
                        </View>
                      ))}
                  </>
                )}
                {teamData && teamData.users === null && (
                  <Note color={C.amber}>
                    Para ver correos y eliminar usuarios, actualiza la función
                    cobro-terminal del servidor (guía, “Actualizar a 1.3”).
                  </Note>
                )}
                <Button
                  title="Actualizar lista"
                  secondary
                  small
                  disabled={teamBusy}
                  onPress={() => void teamAction(async () => {})}
                />
                <Note>El vendedor vende a precio de lista, ve existencias (sin costos), da de alta clientes y ve sus ventas del día. No cancela, no devuelve ni ve reportes.</Note>
              </Card>
              <Text style={s.section}>Invitar vendedor</Text>
              <Card>
                <Note>Código personal de un solo uso para crear la cuenta del vendedor. Vence en 7 días y queda ligado a su teléfono.</Note>
                {cf("inviteName", "Nombre del vendedor *", {
                  placeholder: "Luis",
                })}
                <Button
                  icon="tag" title={
                    teamBusy ? "Creando…" : "Crear código de invitación"
                  }
                  disabled={teamBusy}
                  onPress={() => void createInvite()}
                />
                {!!newInvite && (
                  <Card tone="ok">
                    <Note>{`Código para ${newInvite.name}`}</Note>
                    <Text
                      style={[
                        s.title,
                        { textAlign: "center", letterSpacing: 2 },
                      ]}
                    >
                      {formatShortCode(newInvite.code)}
                    </Text>
                    <Note>{`Vence el ${fmtDay(localDay(newInvite.expires))} · un solo uso`}</Note>
                    <Button
                      icon="send" title="Enviar por WhatsApp"
                      onPress={() =>
                        shareInvite(
                          newInvite.code,
                          newInvite.name,
                          newInvite.expires,
                        )
                      }
                    />
                  </Card>
                )}
                {(teamData?.invites || [])
                  .filter((inv: Row) => (inv.kind || "seller") === "seller")
                  .slice(0, 12)
                  .map((inv: Row) => {
                    const used = !!inv.used_by;
                    const expired =
                      !used && new Date(inv.expires_at).getTime() < Date.now();
                    const user = used
                      ? members.find((m) => m.user_id === inv.used_by)
                      : null;
                    const state = inv.revoked
                      ? "Revocado"
                      : used
                        ? `Usado por ${user?.name || inv.name}`
                        : expired
                          ? "Vencido"
                          : `Vigente · vence ${fmtDay(localDay(inv.expires_at))}`;
                    const live = !inv.revoked && !used && !expired;
                    return (
                      <View
                        key={inv.code}
                        style={[s.cartRow, { flexWrap: "wrap" }]}
                      >
                        <View style={{ flex: 1, minWidth: 160 }}>
                          <Text
                            style={[s.body, { fontWeight: "700" }]}
                          >{`${formatShortCode(inv.code)} · ${inv.name}`}</Text>
                          <Note color={live ? C.green : C.muted}>{state}</Note>
                        </View>
                        {live && (
                          <>
                            <Button
                              title="Compartir"
                              secondary
                              small
                              onPress={() =>
                                shareInvite(inv.code, inv.name, inv.expires_at)
                              }
                            />
                            <Button
                              title="Revocar"
                              danger
                              small
                              onPress={() =>
                                void teamAction(
                                  () =>
                                    getCloud()!.update(
                                      "invites",
                                      `code=eq.${inv.code}`,
                                      { revoked: true },
                                    ),
                                  `Código de ${inv.name} revocado`,
                                )
                              }
                            />
                          </>
                        )}
                      </View>
                    );
                  })}
              </Card>
              <Text style={s.section}>Dónde se registran sus cobros</Text>
              <Card>
                {(["Efectivo", "Transferencia", "Tarjeta"] as const).map(
                  (method) => (
                    <View key={method} style={s.field}>
                      <Text style={s.label}>{`${method} →`}</Text>
                      <Chips
                        options={accounts.map((a) => ({
                          id: a.id,
                          name: a.name,
                        }))}
                        value={accountsMap[method] || ""}
                        onChange={(id) => {
                          b!.setSetting("sellerAccounts", {
                            ...accountsMap,
                            [method]: id,
                          });
                          refresh();
                        }}
                      />
                    </View>
                  ),
                )}
                <Note>
                  Las ventas con tarjeta descuentan la comisión igual que las
                  tuyas.
                </Note>
              </Card>
              <Text style={s.section}>
                Cobro con tarjeta desde el teléfono del vendedor
              </Text>
              <Card>
                <View style={s.between}>
                  <Text style={[s.body, { flex: 1 }]}>
                    Permitir que los vendedores cobren en la terminal
                  </Text>
                  <Switch
                    value={sellerTerminal}
                    disabled={!mpCfg?.terminalId}
                    onValueChange={(v) => {
                      b!.setSetting("sellerTerminal", v);
                      refresh();
                      void runSync();
                    }}
                  />
                </View>
                <Note>
                  {mpCfg?.terminalId
                    ? `Terminal: ${mpCfg.terminalLabel || mpCfg.terminalId}`
                    : "Primero configura tu terminal en Ajustes → Terminal Mercado Pago."}
                </Note>
                <Note>
                  La clave de Mercado Pago vive en tu servidor (función
                  cobro-terminal), nunca en el teléfono del vendedor; él no
                  puede hacer devoluciones.
                </Note>
                <Button
                  title="Probar función del servidor"
                  secondary
                  small
                  disabled={teamBusy}
                  onPress={() =>
                    void teamAction(async () => {
                      const r = await getCloud()!.invoke("cobro-terminal", {
                        action: "ping",
                      });
                      if (!r.ok)
                        throw new Error(
                          r.data?.message ||
                            `La función respondió ${r.status}.`,
                        );
                      setTeamMsg({
                        text: `La función responde. ${r.data?.terminal ? "Terminal lista para vendedores." : "La terminal aún no está habilitada para vendedores."}`,
                        tone: "ok",
                      });
                    })
                  }
                />
              </Card>
              <Button
                title="Desconectar este teléfono"
                secondary
                small
                onPress={() =>
                  Alert.alert(
                    "Desconectar",
                    "Dejarás de recibir ventas de vendedores en este teléfono hasta que vuelvas a entrar.",
                    [
                      { text: "Volver", style: "cancel" },
                      {
                        text: "Desconectar",
                        style: "destructive",
                        onPress: () => {
                          void detachPush(b!, getCloud())
                            .then(() => {
                              for (const k of [
                                "cloudSession",
                                "cloudConfig",
                                "cloudPub",
                                "cloudLastSync",
                              ])
                                b!.setSetting(k, null);
                              cloudRef.current = null;
                              setTeamData(null);
                              setCloudStatus(null);
                              refresh();
                            })
                            .catch((e) =>
                              setTeamMsg({ text: errText(e), tone: "bad" }),
                            );
                        },
                      },
                    ],
                  )
                }
              />
            </>
          )}
        </>
      ),
    };
  }
  return null;
}
