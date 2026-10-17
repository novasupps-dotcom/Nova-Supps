import React from "react";
import { Switch, View } from "react-native";
import { Text } from "../text";
import { cardFee, feeLabel, grossUp, localDay, money } from "../business";
import { deviceId } from "../device";
import { Button, C, Card, MenuList, Note, Pill, fmtDay, s } from "../ui";
import { TILE } from "../theme";
import { CloudBackupCard } from "./CloudBackup";
import { CustomerCatalogPage } from "./CustomerCatalog";
import type { Body, OwnerPageContext } from "./ownerContext";
import {
  ADVANCED_MENU,
  SETTINGS_MENU,
  VERSION,
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
    filters,
  } = ctx;
  const d = data!;
  if (page === "Catálogo para clientes")
    return {
      scroll: (
        <CustomerCatalogPage
          b={b!}
          products={data!.products}
          customers={data!.customers}
          feeBps={data!.feeBps}
          notify={notify}
          getCloud={getCloud}
          initialCustomerId={filters["Catálogo para clientes"] || ""}
          onSent={refresh}
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
              Guarda una copia fuera de la app (Drive, correo o WhatsApp) antes
              de cambiar de teléfono o desinstalar.
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
            {excelCard("Descargar Excel de ventas")}
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
    <MenuList
      items={items.map((item) => ({
        key: item.page,
        title: item.title,
        desc: item.desc,
        icon: item.icon,
        tint: item.tint,
        onPress: () => go(item.page),
      }))}
    />
  );
  const ex = 100000;
  const pays = grossUp(ex, d.feeBps);
  const stat = (label: string, value: string, color?: string) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>{label}</Text>
      <Text style={[s.body, { fontWeight: "600", color: color || C.ink }]}>
        {value}
      </Text>
    </View>
  );
  return {
    scroll: (
      <>
        <Text style={s.section}>Cobros</Text>
        <Card>
          <View style={s.between}>
            <Text style={[s.body, { fontWeight: "600", flex: 1 }]}>
              Comisión que absorbe el cliente
            </Text>
            <Text style={s.price}>{feeLabel(d.feeBps)}</Text>
          </View>
          <View style={[s.row, { marginVertical: 8 }]}>
            {stat("Tu precio", money(ex))}
            {stat("El cliente paga", money(pays))}
            {stat("Recibes", money(pays - cardFee(pays, d.feeBps)), C.green)}
          </View>
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
        <MenuList
          items={[
            {
              key: "bio",
              title: "Huella o rostro al abrir",
              icon: "fingerprint",
              tint: TILE.graphite,
              value: !lockApi.bioAvailable
                ? "No disponible"
                : lockApi.bioEnabled
                  ? "Activo"
                  : "Apagado",
            },
            {
              key: "adv",
              title: "Funciones avanzadas",
              desc: "Lotes, cuentas y gastos. Tus datos no se pierden.",
              icon: "sliders-horizontal",
              tint: TILE.graphite,
              right: (
                <Switch
                  accessibilityLabel="Funciones avanzadas"
                  value={advancedOn}
                  trackColor={{ true: C.green, false: C.fill }}
                  thumbColor="#fff"
                  onValueChange={(on) => (
                    b!.setSetting("advancedModules", on),
                    refresh()
                  )}
                />
              ),
            },
          ]}
        />
        {!lockApi.bioAvailable ? (
          <Note>Registra una huella o rostro en los ajustes del teléfono para usar el bloqueo.</Note>
        ) : (
          <View style={[s.row, { marginTop: -4, marginBottom: 8 }]}>
            <View style={{ flex: 1 }}>
              <Button
                title={lockApi.bioEnabled ? "Desactivar bloqueo" : "Activar bloqueo"}
                secondary
                small
                onPress={async () => {
                  if (await lockApi.setBio(!lockApi.bioEnabled)) refresh();
                }}
              />
            </View>
            {lockApi.bioEnabled && (
              <View style={{ flex: 1 }}>
                <Button title="Bloquear ahora" secondary small onPress={() => lockApi.lockNow()} />
              </View>
            )}
          </View>
        )}
        {advancedOn && (
          <>
            <Text style={s.section}>Funciones avanzadas</Text>
            {menuRows(ADVANCED_MENU)}
          </>
        )}
        <Text
          style={{
            color: C.muted,
            fontSize: 12.5,
            textAlign: "center",
            marginTop: 6,
          }}
        >{`Nova Negocio ${VERSION}`}</Text>
      </>
    ),
  };
}
