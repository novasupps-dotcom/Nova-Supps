import React from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { cardFee, feeLabel, grossUp, localDay, money } from "../business";
import { deviceId } from "../device";
import { Button, C, Card, Note, Pill, fmtDay, followUpsDue, s } from "../ui";
import { CloudBackupCard } from "./CloudBackup";
import { CustomerCatalogPage } from "./CustomerCatalog";
import type { Body, OwnerPageContext } from "./ownerContext";
import {
  ADVANCED_MENU,
  SETTINGS_MENU,
  VERSION,
  minus,
  type MenuItem,
} from "./ownerShared";
import { PromotionsPage } from "./Promotions";
import { PushCard } from "./PushCard";

export function renderParameters(ctx: OwnerPageContext): Body | null {
  const {
    data,
    page,
    b,
    excelCard,
    line,
    go,
    open,
    exportBackup,
    revision,
    notify,
    refresh,
    syncRef,
    getCloud,
    importBackup,
    previousBackup,
    restoreFromCloud,
    lockApi,
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
  if (page === "Catálogo para clientes")
    return {
      scroll: (
        <CustomerCatalogPage
          b={b!}
          products={data!.products}
          feeBps={data!.feeBps}
          notify={notify}
        />
      ),
    };

  if (page === "Promociones")
    return {
      scroll: (
        <PromotionsPage
          b={b!}
          products={data!.products}
          onChanged={() => {
            refresh();
            void syncRef.current();
          }}
          notify={notify}
        />
      ),
    };

  if (page === "Respaldo")
    return {
      scroll: (
        <>
          <Card>
            <Text style={s.subtitle}>Tus datos viven en este teléfono</Text>
            <Note>
              Guarda una copia fuera de la app (Drive, OneDrive, correo o
              WhatsApp) antes de cambiar de equipo o desinstalar. El respaldo
              incluye tus registros y fotos añadidas; las imágenes originales
              vienen con la app.
            </Note>
            <View style={{ height: 8 }} />
            <Pill
              text={
                d.lastBackup
                  ? "Último respaldo: " + fmtDay(localDay(d.lastBackup))
                  : "Sin respaldos todavía"
              }
              tone={d.lastBackup ? "ok" : "warn"}
            />
            <View style={{ height: 8 }} />
            <Button
              title="Guardar / compartir respaldo"
              onPress={exportBackup}
            />
            <Button
              title="Restaurar archivo JSON"
              secondary
              onPress={importBackup}
            />
            <Button
              title="Compartir copia previa a restauración"
              secondary
              onPress={previousBackup}
            />
            <Note>
              La app conserva internamente solo las últimas 3 copias para no
              llenar el teléfono.
            </Note>
            <View style={{ height: 8 }} />
            {excelCard()}
          </Card>
          <CloudBackupCard
            b={b!}
            cloud={getCloud()}
            appVersion={VERSION}
            device={deviceId(b!)}
            onRestore={(raw) => restoreFromCloud(raw)}
          />
        </>
      ),
    };
  const advancedOn = !!b!.setting("advancedModules", false);
  const menuRows = (items: MenuItem[]) => (
    <Card>
      {items.map((item, i) => (
        <Pressable
          key={item.page}
          accessibilityRole="button"
          onPress={() => go(item.page)}
          style={[
            s.menuRow,
            i === items.length - 1 && { borderBottomWidth: 0 },
          ]}
        >
          <Text style={s.menuIcon}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.body, { fontWeight: "700" }]}>{item.title}</Text>
            <Note>{item.desc}</Note>
          </View>
          <Text style={{ color: C.muted, fontSize: 20 }}>›</Text>
        </Pressable>
      ))}
    </Card>
  );
  const ex = 100000;
  return {
    scroll: (
      <>
        <Text style={s.section}>Cobros</Text>
        <Card>
          <View style={s.between}>
            <View style={{ flex: 1 }}>
              <Text style={[s.body, { fontWeight: "700" }]}>
                Comisión que absorbe el cliente
              </Text>
              <Note>
                Con cualquier forma de pago. Tú recibes tu precio completo.
              </Note>
            </View>
            <Text style={s.price}>{feeLabel(d.feeBps)}</Text>
          </View>
          {line(`Tu precio`, money(ex))}
          {line("El cliente paga", money(grossUp(ex, d.feeBps)), {
            bold: true,
          })}
          {line(
            `Mercado Pago descuenta ${feeLabel(d.feeBps)}`,
            minus(cardFee(grossUp(ex, d.feeBps), d.feeBps)),
            { color: C.red },
          )}
          {line(
            "Recibes",
            money(
              grossUp(ex, d.feeBps) - cardFee(grossUp(ex, d.feeBps), d.feeBps),
            ),
            { bold: true, color: C.green },
          )}
          <Button
            title="Cambiar porcentaje"
            secondary
            small
            onPress={() =>
              open("Configuración", { rate: (d.feeBps / 100).toFixed(2) })
            }
          />
        </Card>
        {menuRows(SETTINGS_MENU[0].items)}
        <Text style={s.section}>Ventas</Text>
        {menuRows(SETTINGS_MENU[1].items)}
        <Text style={s.section}>Equipo</Text>
        {menuRows(SETTINGS_MENU[2].items)}
        <PushCard
          b={b!}
          cloud={getCloud()}
          revision={revision}
          onChanged={refresh}
        />
        <Text style={s.section}>Datos y seguridad</Text>
        {menuRows(SETTINGS_MENU[3].items)}

        <Card>
          <View style={s.between}>
            <View style={{ flex: 1 }}>
              <Text style={[s.body, { fontWeight: "700" }]}>
                Mostrar funciones avanzadas
              </Text>
              <Note>
                Lotes, paquetes, cuentas, gastos, campañas, compañías y
                ubicaciones. Tus datos se conservan aunque estén ocultas.
              </Note>
            </View>
            <Switch
              accessibilityLabel="Funciones avanzadas"
              value={advancedOn}
              onValueChange={(on) => (
                b!.setSetting("advancedModules", on),
                refresh()
              )}
            />
          </View>
        </Card>
        {advancedOn && menuRows(ADVANCED_MENU)}

        <Card>
          <Text style={s.subtitle}>🔒 Acceso biométrico</Text>
          <Note>
            {lockApi.bioAvailable
              ? lockApi.bioEnabled
                ? "Activo: se pide la huella o el rostro al abrir la app. Usa Bloquear ahora para pedirla otra vez."
                : "Desactivado en este teléfono."
              : "Registra una huella o rostro en los ajustes del teléfono para activarlo."}
          </Note>
          {lockApi.bioAvailable && (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Button
                  title={
                    lockApi.bioEnabled
                      ? "Desactivar bloqueo"
                      : "Activar bloqueo"
                  }
                  secondary
                  small
                  onPress={async () => {
                    if (await lockApi.setBio(!lockApi.bioEnabled)) refresh();
                  }}
                />
              </View>
              {lockApi.bioEnabled && (
                <View style={{ flex: 1 }}>
                  <Button
                    title="Bloquear ahora"
                    secondary
                    small
                    onPress={() => lockApi.lockNow()}
                  />
                </View>
              )}
            </View>
          )}
        </Card>
        <Note>{`Nova Negocio ${VERSION}`}</Note>
      </>
    ),
  };
}
