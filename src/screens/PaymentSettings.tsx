import * as LocalAuthentication from "expo-local-authentication";
import React from "react";
import { money, localDay } from "../business";
import { fmtDay } from "../ui";
import { Alert, Switch, Text, TextInput, View } from "react-native";
import { MercadoPago, type MpConfig } from "../mercadopago";
import {
  TRANSFER_TEMPLATES,
  cleanTransfer,
  validateTransfer,
  type TransferAccount,
} from "../transfer";
import { Button, C, Card, Chips, Note, Pill, followUpsDue, s } from "../ui";
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
  } = ctx;
  const d = data!;
  const {
    products,
    customers,
    campaigns,
    companies,
    locations,
    accounts,
    sales,
    lots,
    m,
  } = d;
  const low = products.filter(
    (p) => !p.archived && p.inventoryKnown && p.available <= p.minimum,
  );
  const soon = followUpsDue(customers);
  if (page === "Transferencias") {
    const list: TransferAccount[] = b!.setting("transferAccounts", []);
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
    const missing = TRANSFER_TEMPLATES.filter(
      (t) => !list.some((a) => a.id === t.id),
    );
    return {
      scroll: (
        <>
          <Note>
            Captura aquí tus datos para que te paguen por transferencia.
            Aparecen SOLO cuando eliges transferencia al vender (en tu teléfono
            y en el de los vendedores a los que se los asignes en Equipo), con
            un botón para mandárselos al cliente.
          </Note>
          {list.map((a) => (
            <Card key={a.id}>
              <View style={s.between}>
                <Text style={[s.subtitle, { flex: 1 }]}>{`🏦 ${a.label}`}</Text>
              </View>
              <Note>{`Titular: ${a.holder}`}</Note>
              {!!a.clabe && <Text style={s.body}>{`CLABE ${a.clabe}`}</Text>}
              {!!a.account && (
                <Text style={s.body}>{`Cuenta ${a.account}`}</Text>
              )}
              {!!a.card && <Text style={s.body}>{`Tarjeta ${a.card}`}</Text>}
              {!!a.note && <Note>{a.note}</Note>}
              <Note>{`Cuenta en la app: ${accounts.find((x) => x.id === a.accountId)?.name || "sin asignar"}`}</Note>
              <View style={s.wrap}>
                <Button
                  title="Editar"
                  secondary
                  small
                  onPress={() => (setTrErr(""), setTrEdit({ ...a }))}
                />
                <Button
                  title="Eliminar"
                  danger
                  small
                  onPress={() =>
                    Alert.alert(
                      "Eliminar datos",
                      `¿Quitar los datos de ${a.label}? Tus vendedores dejarán de verlos.`,
                      [
                        { text: "Volver", style: "cancel" },
                        {
                          text: "Eliminar",
                          style: "destructive",
                          onPress: () =>
                            save(list.filter((x) => x.id !== a.id)),
                        },
                      ],
                    )
                  }
                />
              </View>
            </Card>
          ))}
          {!list.length && !trEdit && (
            <Note color={C.amber}>
              Aún no capturas datos para transferencia.
            </Note>
          )}
          {trEdit ? (
            <Card tone="ok">
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
          <Note>
            Se publican a tu base en línea al guardar. Asigna a cada vendedor
            cuáles ve en Parámetros → Vendedores.
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
            <Note>
              Con la terminal activa, al vender con una cuenta de tipo Tarjeta
              la app manda el monto a tu Point Smart (modo Punto de Venta) y
              registra la venta solo si Mercado Pago aprueba el pago. Si la
              terminal está en modo normal, se cobra directo en ella y la app
              busca el pago para ligarlo a la venta.
            </Note>
          </Card>
          {!!mpMsg && (
            <Card tone={mpMsg.tone}>
              <Text style={s.body}>{mpMsg.text}</Text>
            </Card>
          )}
          <Text style={s.section}>1 · Clave de acceso</Text>
          <Card>
            <Note>
              En Mercado Pago Developers abre tu aplicación → Credenciales de
              producción → copia el Access Token (empieza con APP_USR). Se
              guarda solo en este teléfono, no se incluye en los respaldos y
              para cambiarla se pide tu huella.
            </Note>
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
            <Note>
              Antes, vincula tu Point Smart a una sucursal y caja desde la app
              de Mercado Pago (en la terminal: “Soy responsable del negocio” y
              escanea el QR).
            </Note>
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
                    backgroundColor: "#fff",
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
