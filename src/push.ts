// Avisos push por cuenta y teléfono; seguimientos locales a las 9:00.
import { Platform } from "react-native";
import type { Business, Row } from "./business";
import type { Cloud } from "./cloud";
import { canPush, notifications, projectId } from "./native";

export type PushState =
  | "ok"
  | "off"
  | "inactive"
  | "unavailable"
  | "no_project"
  | "denied"
  | "schema_missing"
  | "error";
const SIX_HOURS = 6 * 3600_000;
export const PUSH_TEXT: Record<PushState, string> = {
  ok: "Activos en este teléfono.",
  off: "Los apagaste en este teléfono.",
  inactive: "Aún no están activos en este teléfono.",
  unavailable:
    "Los avisos estarán disponibles al instalar la nueva versión de Android.",
  no_project:
    "Falta terminar la configuración de avisos de la app. Consulta la guía de Android.",
  denied: "Activa los avisos en Ajustes → Nova Negocio → Notificaciones.",
  schema_missing:
    "La base en línea necesita la actualización 2.2 para guardar los avisos.",
  error:
    "No se pudieron activar los avisos. Revisa la conexión e intenta de nuevo.",
};
const inflight = new WeakMap<Business, Promise<PushState>>();
const registrations = new WeakMap<Business, number>();
const handledResponses = new Set<string>();

export function setupNotifications(
  onTap?: (data: Row) => void,
  onReceive?: (data: Row) => void,
  enabled = () => true,
): () => void {
  const N = notifications();
  if (!N) return () => {};
  let alive = true;
  const subscriptions: { remove(): void }[] = [];
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: enabled(),
        shouldShowList: enabled(),
        shouldPlaySound: enabled(),
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === "android") {
      void N.setNotificationChannelAsync("ventas", {
        name: "Ventas y vendedores",
        importance: N.AndroidImportance.HIGH,
        sound: "default",
      }).catch(() => {});
      void N.setNotificationChannelAsync("seguimientos", {
        name: "Seguimientos de clientes",
        importance: N.AndroidImportance.DEFAULT,
      }).catch(() => {});
    }
    const tap = (response: any) => {
      if (!alive || !enabled()) return;
      const id = response?.notification?.request?.identifier;
      if (!id || handledResponses.has(id)) return;
      handledResponses.add(id);
      if (handledResponses.size > 100)
        handledResponses.delete(handledResponses.values().next().value!);
      onTap?.(response.notification.request.content.data || {});
      void N.clearLastNotificationResponseAsync?.().catch(() => {});
    };
    subscriptions.push(N.addNotificationResponseReceivedListener(tap));
    subscriptions.push(
      N.addNotificationReceivedListener((n) => {
        if (alive && enabled())
          onReceive?.((n?.request?.content?.data as Row) || {});
      }),
    );
    void N.getLastNotificationResponseAsync?.()
      .then((r) => {
        if (r) tap(r);
      })
      .catch(() => {});
  } catch {}
  return () => {
    alive = false;
    subscriptions.forEach((s) => s.remove());
  };
}

export function registerPush(
  b: Business,
  cloud: Cloud,
  ask = false,
): Promise<PushState> {
  const current = inflight.get(b);
  if (current) return current;
  const work = doRegister(b, cloud, ask, registrations.get(b) || 0).finally(
    () => inflight.delete(b),
  );
  inflight.set(b, work);
  return work;
}

async function doRegister(
  b: Business,
  cloud: Cloud,
  ask: boolean,
  registration: number,
): Promise<PushState> {
  if (b.setting("pushOff", false) === true && !ask) return "off";
  const N = notifications();
  if (!N || !canPush()) return "unavailable";
  const pid = projectId();
  if (!pid) return "no_project";
  if (!cloud.session || !cloud.userId) return "inactive";
  const user = cloud.userId,
    url = cloud.cfg.url;
  try {
    // Android 13 exige crear el canal antes de pedir permiso o el token.
    if (Platform.OS === "android")
      await N.setNotificationChannelAsync("ventas", {
        name: "Ventas y vendedores",
        importance: N.AndroidImportance.HIGH,
        sound: "default",
      });
    let permission = await N.getPermissionsAsync();
    if (!permission.granted && ask && permission.canAskAgain !== false)
      permission = await N.requestPermissionsAsync();
    if (!permission.granted) return "denied";
    const previous = b.setting("pushToken", null);
    if (
      !ask &&
      previous?.user === user &&
      previous?.url === url &&
      Date.now() - Date.parse(previous.at || "") < SIX_HOURS
    )
      return "ok";
    const token = (await N.getExpoPushTokenAsync({ projectId: pid })).data;
    await cloud.rpc("save_push_token", {
      p_token: token,
      p_platform: Platform.OS,
    });
    // Puede haberse cerrado la sesión mientras se obtenía el token.
    if (
      cloud.userId !== user ||
      (registrations.get(b) || 0) !== registration ||
      (b.setting("pushOff", false) === true && !ask)
    ) {
      await cloud.rpc("delete_push_token", {});
      return "off";
    }
    b.setSetting("pushToken", {
      token,
      user,
      url,
      at: new Date().toISOString(),
    });
    b.setSetting("pushOff", null);
    return "ok";
  } catch (e) {
    const code = String((e as any)?.code || ""),
      status = Number((e as any)?.status || 0);
    return status === 404 || code === "PGRST202" || code === "42883"
      ? "schema_missing"
      : "error";
  }
}

export async function autoRegisterPush(
  b: Business,
  cloud: Cloud,
): Promise<PushState> {
  if (b.setting("pushOff", false)) {
    // Una desactivación sin internet se reintenta antes de registrar otra vez.
    if (b.setting("pushToken", null)) {
      try {
        await unregisterPush(b, cloud);
      } catch {}
    }
    return "off";
  }
  if (!notifications() || !canPush()) return "unavailable";
  if (!projectId()) return "no_project";
  const last = b.setting("pushAttempt", null);
  if (
    last?.user === cloud.userId &&
    last?.url === cloud.cfg.url &&
    Date.now() - last.at < 3600_000
  )
    return last.state;
  const ask = !b.setting("pushAsked", false);
  b.setSetting("pushAsked", true);
  const state = await registerPush(b, cloud, ask);
  b.setSetting("pushAttempt", {
    user: cloud.userId,
    url: cloud.cfg.url,
    at: Date.now(),
    state,
  });
  return state;
}

export async function unregisterPush(
  b: Business,
  cloud: Cloud | null,
): Promise<void> {
  registrations.set(b, (registrations.get(b) || 0) + 1);
  b.setSetting("pushOff", true);
  await scheduleFollowUps([], new Date(), false);
  const pending = inflight.get(b);
  if (pending) await pending;
  b.setSetting("pushOff", true);
  const saved = b.setting("pushToken", null);
  if (!saved?.token) return;
  if (
    !cloud?.session ||
    saved.user !== cloud.userId ||
    (saved.url && saved.url !== cloud.cfg.url)
  )
    throw new Error(
      "Conéctate con la cuenta de este teléfono para terminar de desactivar los avisos.",
    );
  await cloud.rpc("delete_push_token", {});
  b.setSetting("pushToken", null);
  b.setSetting("pushAttempt", null);
}

/** Cerrar sesión retira el token y conserva la preferencia del teléfono. */
export async function detachPush(
  b: Business,
  cloud: Cloud | null,
): Promise<void> {
  const off = b.setting("pushOff", false);
  await unregisterPush(b, cloud);
  b.setSetting("pushOff", off || null);
  b.setSetting("pushAsked", null);
}

export async function pushStatus(b: Business): Promise<PushState> {
  if (b.setting("pushOff", false)) return "off";
  const N = notifications();
  if (!N || !canPush()) return "unavailable";
  if (!projectId()) return "no_project";
  try {
    if (!(await N.getPermissionsAsync()).granted) return "denied";
  } catch {
    return "error";
  }
  const saved = b.setting("pushToken", null);
  const session = b.setting("cloudSession", null);
  if (
    saved?.user === session?.user?.id &&
    saved?.url === b.setting("cloudConfig", null)?.url &&
    saved?.token
  )
    return "ok";
  return b.setting("pushAttempt", null)?.state === "schema_missing"
    ? "schema_missing"
    : "inactive";
}

type FollowUp = { id: string; name: string; nextDate?: string; archived?: any };
let scheduling: Promise<number> = Promise.resolve(0);
export function scheduleFollowUps(
  list: FollowUp[],
  now = new Date(),
  enabled = true,
): Promise<number> {
  scheduling = scheduling
    .catch(() => 0)
    .then(() => doSchedule(list, now, enabled));
  return scheduling;
}
async function doSchedule(
  list: FollowUp[],
  now: Date,
  enabled: boolean,
): Promise<number> {
  const N = notifications();
  if (!N) return 0;
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter(
      (n) =>
        String(n.identifier).startsWith("seguimiento-") ||
        n.content?.data?.kind === "followup",
    );
    for (const n of ours)
      await N.cancelScheduledNotificationAsync(n.identifier);
    if (!enabled || !(await N.getPermissionsAsync()).granted) return 0;
    const limit = new Date(now);
    limit.setDate(limit.getDate() + 30);
    const max = Math.max(
      0,
      Math.min(40, 60 - (scheduled.length - ours.length)),
    );
    let count = 0;
    const seen = new Set<string>();
    for (const customer of [...list].sort(
      (a, b) =>
        String(a.nextDate).localeCompare(String(b.nextDate)) ||
        a.id.localeCompare(b.id),
    )) {
      if (count >= max) break;
      if (
        customer.archived ||
        seen.has(customer.id) ||
        !customer.nextDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(customer.nextDate)
      )
        continue;
      const [y, m, d] = customer.nextDate.split("-").map(Number);
      const at = new Date(y, m - 1, d, 9, 0, 0);
      if (
        at.getFullYear() !== y ||
        at.getMonth() !== m - 1 ||
        at.getDate() !== d ||
        at <= now ||
        at > limit
      )
        continue;
      await N.scheduleNotificationAsync({
        identifier: "seguimiento-" + customer.id,
        content: {
          title: "🔔 Seguimiento de hoy",
          body: "Toca dar seguimiento a " + customer.name + ".",
          data: { kind: "followup", customerId: customer.id },
        },
        trigger: {
          type: N.SchedulableTriggerInputTypes.DATE,
          date: at,
          channelId: "seguimientos",
        } as any,
      });
      seen.add(customer.id);
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}
