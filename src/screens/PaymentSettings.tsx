import * as LocalAuthentication from "expo-local-authentication";
import React from "react";
import { money, localDay } from "../business";
import { fmtDay } from "../ui";
import { Alert, Pressable, Switch, View } from "react-native";
import { Text, TextInput } from "../text";
import { MercadoPago, type MpConfig } from "../mercadopago";
import {
  TRANSFER_TEMPLATES,
  cleanTransfer,
  validateTransfer,
  type TransferAccount,
} from "../transfer";
import { Button, C, Card, Chips, Icon, IconButton, Note, Pill, s } from "../ui";
import { TILE } from "../theme";
import type { Row } from "../business";
import type { Body, OwnerPageContext } from "./ownerContext";

export function renderPaymentSettings(ctx: OwnerPageContext): Body | null {
  if (
    !["Terminal Mercado Pago", "Transferencias", "Cuentas"].includes(ctx.page)
  )
    return null;
  const {
    data,
    page,
    b,
    open,
    cashAccount,
    errText,
    notify,
    refresh,
    syncRef,
    trEdit,
    setTrEdit,
    setTrErr,
    trErr,
    setMpBusy,
    setMpMsg,
    mpMsg,
    mpToken,
    setMpToken,
    mpBusy,
    authAvailable,
    setMpTerms,
    mpTerms,
    mpPdvSet,
    setMpPdvSet,
    startCharge,
    teamData,
    teamAction,
    teamMsg,
    getCloud,
  } = ctx;
  const d = data!;
  const {
    accounts,
  } = d;
  if (page === "Transferencias") {
    const list: TransferAccount[] = b!.setting("transferAccounts", []);
    const sellers: Row[] = (teamData?.members || []).filter((m) => m.role === "seller");
    const save = (next: TransferAccount[]) => {
      b!.setSetting("transferAccounts", next);
      refresh();
      void syncRef.current();
    };
    const tf = (
      key: keyof TransferAccount,
      label: string,
      kind?: any,
      placeholder = "",
    ) => (
      <View style={s.field} key={key}>
        <Text style={s.label}>{label}</Text>
        <TextInput
          accessibilityLabel={label}
          style={s.input}
          value={String(trEdit?.[key] || "")}
          onChangeText={(v) => setTrEdit((x) => (x ? { ...x, [key]: v } : x))}
          keyboardType={kind}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
        />
      </View>
    );
    const UseChip = ({ label, on, onPress, a11y }: { label: string; on: boolean; onPress: () => void; a11y?: string }) => (
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`${a11y || label}: ${on ? "sí" : "no"}`}
        onPress={onPress}
        style={({ pressed }) => [
          s.chip,
          { flexDirection: "row", alignItems: "center", gap: 6 },
          on && { backgroundColor: C.ink },
          pressed && { opacity: 0.7 },
        ]}
      >
        {on && <Icon name="check" size={14} color="#fff" />}
        <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
      </Pressable>
    );
    const missing = TRANSFER_TEMPLATES.filter(
      (t) => !list.some((a) => a.id === t.id),
    );
    return {
      scroll: (
        <>
          <Note>Cómo te pagan tus clientes. Edita o elimina cada cuenta y elige quién la usa: tú y cada vendedor.</Note>
          {!!teamMsg && <Note color={teamMsg.tone === "bad" ? C.red : C.green}>{teamMsg.text}</Note>}
          <Text style={s.section}>Cuentas para transferencia</Text>
          {list.map((a) => {
            const usedBy = (m: Row) =>
              Array.isArray(m.transfer_ids) ? m.transfer_ids.includes(a.id) : true;
            return (
              <Card key={a.id}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={[s.menuTile, { backgroundColor: a.id === "mercadopago" ? TILE.blue : TILE.green }]}>
                    <Icon name="landmark" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.body, { fontWeight: "600", fontSize: 17 }]}>{a.label}</Text>
                    <Text style={[s.muted, { fontSize: 13 }]}>{`Titular: ${a.holder}`}</Text>
                  </View>
                  <IconButton
                    icon="pencil"
                    label={`Editar ${a.label}`}
                    bg={C.soft}
                    onPress={() => (setTrErr(""), setTrEdit({ ...a }))}
                  />
                  <IconButton
                    icon="trash-2"
                    label={`Eliminar ${a.label}`}
                    color={C.red}
                    bg={C.redSoft}
                    onPress={() =>
                      Alert.alert(
                        "Eliminar datos",
                        `¿Quitar los datos de ${a.label}? Tus vendedores dejarán de verlos.`,
                        [
                          { text: "Volver", style: "cancel" },
                          {
                            text: "Eliminar",
                            style: "destructive",
                            onPress: () => save(list.filter((x) => x.id !== a.id)),
                          },
                        ],
                      )
                    }
                  />
                </View>
                <View style={{ marginTop: 10, gap: 2 }}>
                  {!!a.clabe && <Text style={s.body}>{`CLABE ${a.clabe.replace(/(\d{4})(?=\d)/g, "$1 ")}`}</Text>}
                  {!!a.account && <Text style={s.body}>{`Cuenta ${a.account}`}</Text>}
                  {!!a.card && <Text style={s.body}>{`Tarjeta ${a.card.replace(/(\d{4})(?=\d)/g, "$1 ")}`}</Text>}
                  {!!a.note && <Note>{a.note}</Note>}
                  <Text style={[s.muted, { fontSize: 13 }]}>
                    {`Se registra en: ${accounts.find((x) => x.id === a.accountId)?.name || "sin asignar"}`}
                  </Text>
                </View>
                <Text style={[s.label, { marginLeft: 0, marginTop: 12 }]}>Quién la usa</Text>
                <View style={s.wrap}>
                  <UseChip
                    label="Tú"
                    on={!a.ownerHidden}
                    onPress={() =>
                      save(list.map((x) => (x.id === a.id ? { ...x, ownerHidden: !x.ownerHidden } : x)))
                    }
                  />
                  {sellers.map((m) => (
                    <UseChip
                      key={m.user_id}
                      label={String(m.name)}
                      on={usedBy(m)}
                      onPress={() => {
                        const ids: string[] = Array.isArray(m.transfer_ids) ? m.transfer_ids : list.map((x) => x.id);
                        const next = usedBy(m) ? ids.filter((x) => x !== a.id) : [...ids, a.id];
                        void teamAction(
                          () => getCloud()!.update("members", `user_id=eq.${m.user_id}`, { transfer_ids: next }),
                          `${m.name} ${usedBy(m) ? "ya no ve" : "ahora ve"} ${a.label}`,
                        );
                      }}
                    />
                  ))}
                </View>
              </Card>
            );
          })}
          {!list.length && !trEdit && (
            <Note color={C.amber}>
              Aún no capturas datos para transferencia.
            </Note>
          )}
          {trEdit ? (
            <Card>
              <Text style={s.subtitle}>
                {list.some((a) => a.id === trEdit.id)
                  ? `Editar ${trEdit.label || "cuenta"}`
                  : `Nueva: ${trEdit.label || "cuenta"}`}
              </Text>
              {tf(
                "label",
                "Nombre que verá el cliente *",
                undefined,
                "Banamex",
              )}
              {tf("bank", "Banco o app", undefined, "Banamex / Mercado Pago")}
              {tf(
                "holder",
                "Titular de la cuenta *",
                undefined,
                "Nombre completo",
              )}
              {tf("clabe", "CLABE (18 dígitos)", "number-pad", "002180…")}
              {tf("account", "Número de cuenta (opcional)", "number-pad")}
              {tf("card", "Número de tarjeta (opcional)", "number-pad")}
              {tf(
                "note",
                "Nota para el cliente (opcional)",
                undefined,
                "Ej. manda tu comprobante por WhatsApp",
              )}
              <Text style={s.label}>Se registra en la cuenta</Text>
              <Chips
                options={[
                  ...accounts
                    .filter((a) => a.kind === "Banco" || a.kind === "Billetera")
                    .map((a) => ({ id: a.id, name: a.name })),
                  { id: "", name: `＋ Nueva cuenta «${trEdit.label || "…"}»` },
                ]}
                value={trEdit.accountId || ""}
                onChange={(v) =>
                  setTrEdit((x) =>
                    x ? { ...x, accountId: v || undefined } : x,
                  )
                }
              />
              <Note>
                Las ventas pagadas a estos datos caen en esa cuenta; así puedes
                filtrarlas en Ventas por banco.
              </Note>
              {!!trErr && <Note color={C.red}>{trErr}</Note>}
              <Button
                title="Guardar datos"
                onPress={() => {
                  const clean = cleanTransfer(trEdit);
                  const problem = validateTransfer(clean);
                  if (problem) return setTrErr(problem);
                  if (
                    !clean.accountId ||
                    !accounts.some((a) => a.id === clean.accountId)
                  ) {
                    const same = accounts.find(
                      (a) =>
                        (a.kind === "Banco" || a.kind === "Billetera") &&
                        a.name.trim().toLowerCase() ===
                          clean.label.toLowerCase(),
                    );
                    clean.accountId = same
                      ? same.id
                      : b!.addAccount(
                          clean.label,
                          clean.id === "mercadopago" ? "Billetera" : "Banco",
                          0,
                        );
                  }
                  const exists = list.some((a) => a.id === clean.id);
                  save(
                    exists
                      ? list.map((a) => (a.id === clean.id ? clean : a))
                      : [...list, clean],
                  );
                  setTrEdit(null);
                  setTrErr("");
                  notify(`Datos de ${clean.label} guardados`);
                }}
              />
              <Button
                title="Cancelar"
                secondary
                small
                onPress={() => (setTrEdit(null), setTrErr(""))}
              />
            </Card>
          ) : (
            <View style={s.wrap}>
              {missing.map((t) => (
                <Button
                  key={t.id}
                  title={`＋ ${t.label}`}
                  small
                  onPress={() => (setTrErr(""), setTrEdit({ ...t }))}
                />
              ))}
              <Button
                title="＋ Otra cuenta"
                secondary
                small
                onPress={() => (
                  setTrErr(""),
                  setTrEdit({
                    ...TRANSFER_TEMPLATES[1],
                    id: "cta-" + Date.now().toString(36),
                    label: "",
                    bank: "",
                  })
                )}
              />
            </View>
          )}
          <Text style={s.section}>Formas de cobro al vender</Text>
          <View style={[s.list, { paddingHorizontal: 16 }]}>
            <View style={[s.cartRow, { flexWrap: "wrap" }, !sellers.length && { borderBottomWidth: 0 }]}>
              <Text style={[s.body, { width: "100%", fontWeight: "500" }]}>Tú (dueño) · en tu carrito</Text>
              {accounts.map((acc) => {
                const hidden: string[] = b!.setting("hiddenPayAccounts", []) || [];
                const on = !hidden.includes(acc.id);
                const short = String(acc.name).split(" · ")[0];
                const label = accounts.filter((x) => String(x.name).split(" · ")[0] === short).length > 1 ? String(acc.name) : short;
                return (
                  <UseChip
                    key={acc.id}
                    label={label}
                    a11y={`Tu carrito · ${label}`}
                    on={on}
                    onPress={() => {
                      const next = on ? [...hidden, acc.id] : hidden.filter((x) => x !== acc.id);
                      if (accounts.every((x) => next.includes(x.id))) return notify("Deja al menos una forma de cobro en tu carrito.");
                      b!.setSetting("hiddenPayAccounts", next);
                      refresh();
                      notify(on ? `${label} ya no aparece en tu carrito` : `${label} vuelve a tu carrito`);
                    }}
                  />
                );
              })}
            </View>
            {sellers.map((m, i) => {
              const methods: string[] = Array.isArray(m.methods) ? m.methods : ["Tarjeta", "Efectivo", "Transferencia"];
              return (
                <View key={m.user_id} style={[s.cartRow, { flexWrap: "wrap" }, i === sellers.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={[s.body, { width: "100%", fontWeight: "500" }]}>{m.name}</Text>
                  {(["Efectivo", "Tarjeta", "Transferencia"] as const).map((meth) => {
                    const on = methods.includes(meth);
                    return (
                      <UseChip
                        key={meth}
                        label={meth === "Tarjeta" ? "Tarjeta (terminal)" : meth}
                        on={on}
                        onPress={() => {
                          const next = on
                            ? methods.filter((x) => x !== meth)
                            : ["Tarjeta", "Efectivo", "Transferencia"].filter((x) => x === meth || methods.includes(x));
                          if (!next.length) return notify("Deja al menos una forma de pago.");
                          void teamAction(
                            () => getCloud()!.update("members", `user_id=eq.${m.user_id}`, { methods: next }),
                            `${m.name}: ${next.join(", ")}`,
                          );
                        }}
                      />
                    );
                  })}
                </View>
              );
            })}
          </View>
          <Note>
            {`Toca una forma para quitarla o ponerla al cobrar. Tus ventas y saldos anteriores no cambian. `}
            {teamData
              ? sellers.length
                ? "Los cambios llegan a tus vendedores en cuanto se conectan."
                : "Cuando tengas vendedores, aquí eliges con qué puede cobrar cada uno."
              : "Conecta la base en línea (Ajustes → Vendedores) para elegir con qué cobra cada vendedor."}
          </Note>
        </>
      ),
    };
  }

  if (page === "Terminal Mercado Pago") {
    const cfg = d.mp;
    const save = (next: MpConfig | null) => {
      b!.setSetting("mpConfig", next);
      refresh();
    };
    const busyRun = async (fn: () => Promise<void>) => {
      setMpBusy(true);
      setMpMsg(null);
      try {
        await fn();
      } catch (e) {
        setMpMsg({ text: errText(e), tone: "bad" });
      } finally {
        setMpBusy(false);
      }
    };
    return {
      scroll: (
        <>
          <Card tone={cfg?.enabled && cfg.terminalId ? "ok" : undefined}>
            <View style={s.between}>
              <Text style={[s.subtitle, { flex: 1 }]}>Estado</Text>
              <Pill
                text={
                  !cfg
                    ? "Sin configurar"
                    : !cfg.terminalId
                      ? "Falta elegir terminal"
                      : cfg.enabled
                        ? "Conectada"
                        : "En pausa"
                }
                tone={cfg?.enabled && cfg.terminalId ? "ok" : "warn"}
              />
            </View>
            {!!cfg && (
              <Note>
                Cuenta: {cfg.account || "—"} · Terminal:{" "}
                {cfg.terminalLabel || cfg.terminalId || "sin elegir"}
              </Note>
            )}
            {!!cfg?.terminalId && (
              <View style={[s.between, { marginTop: 8 }]}>
                <Text style={[s.body, { flex: 1 }]}>
                  Enviar a la terminal los cobros con tarjeta
                </Text>
                <Switch
                  value={!!cfg.enabled}
                  onValueChange={(v) => save({ ...cfg, enabled: v })}
                />
              </View>
            )}
            <Note>Al cobrar con tarjeta, la app manda el monto a tu Point (modo Punto de Venta) y registra la venta cuando Mercado Pago lo aprueba. En modo normal, cobras en la terminal y la app liga el pago.</Note>
          </Card>
          {!!mpMsg && (
            <Card tone={mpMsg.tone}>
              <Text style={s.body}>{mpMsg.text}</Text>
            </Card>
          )}
          <Text style={s.section}>1 · Clave de acceso</Text>
          <Card>
            <Note>Mercado Pago Developers → tu aplicación → Credenciales de producción → Access Token (APP_USR…). Se guarda solo en este teléfono y no viaja en los respaldos.</Note>
            <View style={{ height: 8 }} />
            <TextInput
              accessibilityLabel="Access Token de Mercado Pago"
              style={s.input}
              value={mpToken}
              onChangeText={setMpToken}
              placeholder={
                cfg ? "Guardada · …" + cfg.token.slice(-6) : "APP_USR-…"
              }
              placeholderTextColor={C.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title={mpBusy ? "Probando…" : "Guardar y probar conexión"}
              disabled={mpBusy || !mpToken.trim()}
              onPress={() =>
                busyRun(async () => {
                  if (authAvailable) {
                    const r = await LocalAuthentication.authenticateAsync({
                      promptMessage: "Confirmar clave de Mercado Pago",
                      biometricsSecurityLevel: "weak",
                    });
                    if (!r.success)
                      throw new Error(
                        "No se confirmó tu identidad; la clave no se guardó.",
                      );
                  }
                  const token = mpToken.trim();
                  if (/^TEST-/i.test(token))
                    throw new Error(
                      "Esa es una clave de prueba (TEST-…). Para tu terminal real usa el Access Token de Credenciales de producción.",
                    );
                  const client = new MercadoPago(token);
                  // La prueba usa el mismo permiso que necesita la terminal (Point), no /users/me.
                  const list = await client.terminals();
                  let account = "";
                  try {
                    const me = await client.me();
                    account = me?.nickname || String(me?.id || "");
                  } catch {}
                  save({
                    token,
                    account,
                    terminalId: cfg?.terminalId || "",
                    terminalLabel: cfg?.terminalLabel,
                    enabled: cfg?.enabled ?? false,
                  });
                  setMpToken("");
                  setMpTerms(list);
                  setMpMsg({
                    text: `Conexión correcta${account ? " con la cuenta " + account : ""}. ${list.length ? `${list.length} ${list.length === 1 ? "terminal encontrada" : "terminales encontradas"}: elígela abajo.` : "Aún no hay terminales vinculadas: vincula tu Point Smart a una sucursal y caja y toca Buscar mis terminales."}`,
                    tone: "ok",
                  });
                })
              }
            />
            {!!cfg && (
              <Button
                title="Borrar clave de este teléfono"
                secondary
                small
                onPress={() =>
                  Alert.alert(
                    "Borrar clave",
                    "La app dejará de enviar cobros a la terminal.",
                    [
                      { text: "Volver", style: "cancel" },
                      {
                        text: "Borrar",
                        style: "destructive",
                        onPress: () => (
                          save(null),
                          setMpTerms(null),
                          setMpMsg({ text: "Clave borrada.", tone: "ok" })
                        ),
                      },
                    ],
                  )
                }
              />
            )}
          </Card>
          <Text style={s.section}>2 · Terminal</Text>
          <Card>
            <Note>Antes, vincula tu Point a una sucursal y caja desde la app de Mercado Pago.</Note>
            <Button
              title={mpBusy ? "Buscando…" : "Buscar mis terminales"}
              secondary
              disabled={mpBusy || !cfg}
              onPress={() =>
                busyRun(async () => {
                  const list = await new MercadoPago(cfg!.token).terminals();
                  setMpTerms(list);
                  if (!list.length)
                    setMpMsg({
                      text: "No se encontraron terminales en esta cuenta. Revisa que la Point esté vinculada a una sucursal y caja.",
                      tone: "warn",
                    });
                })
              }
            />
            {(mpTerms || []).map((t) => (
              <View key={t.id} style={[s.cartRow, { flexWrap: "wrap" }]}>
                <View style={{ flex: 1, minWidth: 180 }}>
                  <Text style={[s.body, { fontWeight: "700" }]}>{t.id}</Text>
                  <Note>
                    Caja {t.external_pos_id || t.pos_id || "—"} · Modo{" "}
                    {t.operating_mode === "PDV"
                      ? "Punto de Venta"
                      : mpPdvSet[t.id]
                        ? "Punto de Venta (reinicia la terminal para aplicarlo)"
                        : t.operating_mode || "—"}
                  </Note>
                </View>
                {cfg?.terminalId === t.id ? (
                  <Pill text="Elegida" tone="ok" />
                ) : (
                  <Button
                    title="Usar esta"
                    small
                    onPress={() => (
                      save({
                        ...cfg!,
                        terminalId: t.id,
                        terminalLabel: t.id.split("__")[1] || t.id,
                        enabled: true,
                      }),
                      setMpMsg({ text: "Terminal elegida.", tone: "ok" })
                    )}
                  />
                )}
                {t.operating_mode !== "PDV" && !mpPdvSet[t.id] && (
                  <Button
                    title="Activar modo Punto de Venta"
                    secondary
                    small
                    onPress={() =>
                      busyRun(async () => {
                        await new MercadoPago(cfg!.token).setMode(t.id, "PDV");
                        setMpPdvSet((m) => ({ ...m, [t.id]: true }));
                        setMpTerms(
                          await new MercadoPago(cfg!.token).terminals(),
                        );
                        setMpMsg({
                          text: "Listo. Reinicia la terminal y revisa en Más opciones → Ajustes → Modo de vinculación que diga “Punto de Venta (PDV)”.",
                          tone: "ok",
                        });
                      })
                    }
                  />
                )}
              </View>
            ))}
            {!!cfg?.terminalId && (
              <Button
                title="Regresar la terminal a modo normal"
                secondary
                small
                disabled={mpBusy}
                onPress={() =>
                  busyRun(async () => {
                    await new MercadoPago(cfg!.token).setMode(
                      cfg!.terminalId,
                      "STANDALONE",
                    );
                    setMpPdvSet((m) => ({ ...m, [cfg!.terminalId]: false }));
                    setMpMsg({
                      text: "La terminal volverá a cobrar por su cuenta (reiníciala). En modo normal tú y tus vendedores cobran directo en la terminal y la app busca el pago para ligarlo a la venta.",
                      tone: "ok",
                    });
                  })
                }
              />
            )}
          </Card>
          <Text style={s.section}>3 · Prueba</Text>
          <Card>
            <Note>
              Envía un cobro de $10.00 a la terminal, págalo con tu tarjeta y
              después devuélvelo desde aquí. No se registra como venta.
            </Note>
            <Button
              title="Cobro de prueba de $10.00"
              disabled={!cfg?.terminalId || mpBusy}
              onPress={() => startCharge(1000, null, true)}
            />
          </Card>
        </>
      ),
    };
  }
  if (page === "Cuentas")
    return {
      scroll: (
        <>
          <View style={s.wrap}>
            <Button title="＋ Cuenta" small onPress={() => open("Cuenta")} />
            <Button
              title="＋ Movimiento"
              secondary
              small
              onPress={() => open("Movimiento", { accountId: cashAccount() })}
            />
          </View>
          <Note>
            Saldos registrados en la app. No hay conexión automática con bancos.
          </Note>
          <View style={{ height: 8 }} />
          {accounts.map((a) => (
            <Card
              key={a.id}
              onPress={() => open("Movimiento", { accountId: a.id })}
            >
              <View style={s.between}>
                <View style={{ flex: 1 }}>
                  <Text style={s.subtitle}>{a.name}</Text>
                  <Note>{a.kind} · toca para registrar movimiento</Note>
                </View>
                <Text style={s.price}>{money(a.balance)}</Text>
              </View>
              <Button
                title="Renombrar"
                secondary
                small
                onPress={() =>
                  open("Renombrar cuenta", {
                    id: a.id,
                    name: a.name,
                    kind: a.kind,
                  })
                }
              />
            </Card>
          ))}
          <Text style={s.section}>Últimos movimientos</Text>
          {b!
            .all(
              "SELECT l.*,a.name account FROM ledger l JOIN accounts a ON a.id=l.accountId ORDER BY l.created DESC LIMIT 50",
            )
            .map((l) => (
              <View
                key={l.id}
                style={[
                  s.cartRow,
                  {
                    backgroundColor: C.paper,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    marginBottom: 6,
                    borderBottomWidth: 0,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.body}>{l.note}</Text>
                  <Note>
                    {l.account} · {fmtDay(localDay(l.created))}
                  </Note>
                </View>
                <Text
                  style={[
                    s.body,
                    {
                      fontWeight: "800",
                      color: l.amount < 0 ? C.red : C.green,
                    },
                  ]}
                >
                  {money(l.amount)}
                </Text>
              </View>
            ))}
        </>
      ),
    };
  return null;
}
