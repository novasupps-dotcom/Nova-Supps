import React from "react";
import { Alert, Switch, View } from "react-native";
import { Text } from "../text";
import { cardFee, feeLabel, grossUp, localDay, money } from "../business";
import { deviceId } from "../device";
import { Button, C, Card, MenuList, Note, Pill, fmtDay, s } from "../ui";
import { TILE } from "../theme";
import { CloudBackupCard } from "./CloudBackup";
import { CatalogImportPage } from "./CatalogImport";
import { OrderImportPage } from "./OrderImport";
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
import { UpdatesCard } from "./UpdateNotice";

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

  if (page === "Cargar pedido")
    return {
      scroll: (
        <OrderImportPage
          b={b!}
          notify={notify}
          onChanged={() => {
            refresh();
            void syncRef.current();
          }}
        />
      ),
    };

  if (page === "Actualizar catálogo")
    return {
      scroll: (
        <CatalogImportPage
          b={b!}
          notify={notify}
          onChanged={() => {
            refresh();
            void syncRef.current();
          }}
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
            <View style={[s.between, { marginBottom: 8 }]}>
              <Text style={[s.subtitle, { marginBottom: 0 }]}>Respaldo local</Text>
              <Pill
                text={
                  d.lastBackup
                    ? "Último respaldo: " + fmtDay(localDay(d.lastBackup))
                    : "Sin respaldos todavía"
                }
                tone={d.lastBackup ? "ok" : "warn"}
              />
            </View>
            <Button
              title="Guardar / compartir respaldo"
              onPress={exportBackup}
            />
            <Button
              title="Restaurar archivo JSON"
              secondary
              small
              onPress={importBackup}
            />
            <Button
              title="Compartir copia previa a restauración"
              secondary
              small
              onPress={previousBackup}
            />
            <View style={{ height: 6 }} />
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
  const rate = d.cardFeeBps;
  // 2.7: con la comisión en el precio, el cliente paga el precio del catálogo tal cual.
  const pays = d.feeInPrice ? ex : grossUp(ex, rate);
  const switchMode = () => {
    const on = !d.feeInPrice;
    Alert.alert(
      on ? "Incluir la comisión en tus precios" : "Sumar la comisión al cobrar",
      on
        ? `Todos los precios del catálogo suben ${feeLabel(rate)} (ej. ${money(ex)} → ${money(grossUp(ex, rate))}) y al cobrar ya no se suma nada. El cliente paga lo mismo que hoy. Tus vendedores lo ven al sincronizar.`
        : `Todos los precios del catálogo bajan para quitar el ${feeLabel(rate)} (ej. ${money(grossUp(ex, rate))} → ${money(ex)}) y la comisión se vuelve a sumar al cobrar. El cliente paga lo mismo que hoy.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cambiar",
          onPress: () => {
            try {
              const n = b!.setFeeInPrice(on, true);
              refresh();
              void syncRef.current();
              notify(`${on ? "Comisión incluida en el precio" : "Comisión al cobrar"} · ${n} precios ajustados`);
            } catch (e) {
              Alert.alert("Comisión", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };
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
              {d.feeInPrice
                ? "Comisión incluida en tus precios"
                : "Comisión que absorbe el cliente"}
            </Text>
            <Text style={s.price}>{feeLabel(rate)}</Text>
          </View>
          <View style={[s.row, { marginVertical: 8 }]}>
            {stat(d.feeInPrice ? "Precio del catálogo" : "Tu precio", money(ex))}
            {stat("El cliente paga", money(pays))}
            {stat("Recibes", money(pays - cardFee(pays, rate)), C.green)}
          </View>
          <Button
            title="Cambiar porcentaje"
            secondary
            small
            onPress={() =>
              open("Configuración", { rate: (rate / 100).toFixed(2) })
            }
          />
          <Button
            title={
              d.feeInPrice
                ? "Sumar la comisión al cobrar"
                : "Incluir la comisión en el precio"
            }
            secondary
            small
            onPress={switchMode}
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
        <UpdatesCard b={b!} version={VERSION} notify={notify} />
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
