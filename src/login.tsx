// Pantalla de inicio en un teléfono nuevo: si ya tienes cuenta (dueño o vendedor)
// entras SOLO con tu correo y contraseña. Iniciar sesión vuelve este teléfono el
// de tu cuenta (el anterior se desconecta solo). Si olvidaste la contraseña, la
// tienda te manda un correo con un código para poner una nueva.
import React, { useEffect, useState } from "react";
import { BackHandler, Image, ScrollView, View } from "react-native";
import { Text, TextInput } from "./text";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Business } from "./business";
import { Cloud, CloudError, INVITE_MESSAGES, type CloudConfig, type CloudSession } from "./cloud";
import { deviceId } from "./device";
import { storeCloud } from "./storeConfig";
import { LOGO_FULL, LOGO_FULL_RATIO } from "./brand";
import { C, s, Button, Card, Note } from "./ui";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export type LoginResult = "owner" | "active" | "pending";

/**
 * Inicia sesión y registra este teléfono para la cuenta. Devuelve el rol
 * (dueño / vendedor activo / vendedor en pausa). La sesión se guarda en `b`.
 */
export async function loginHere(b: Business, email: string, password: string, conf: CloudConfig = b.setting("cloudConfig", null) || storeCloud()): Promise<LoginResult> {
  if (!email.trim() || !password) throw new Error("Escribe tu correo y tu contraseña.");
  const c = new Cloud(conf, null, (ns: CloudSession | null) => b.setSetting("cloudSession", ns));
  c.device = deviceId(b);
  await c.signIn(email, password);
  let st: string;
  try {
    st = await c.rpc("login_device", {});
  } catch (e) {
    // Base sin actualizar (antes de 1.4): se usa la revisión anterior.
    if (e instanceof CloudError && (e.status === 404 || /login_device/.test(e.message))) st = await c.rpc("request_join", { p_name: "" });
    else throw e;
  }
  if (st !== "owner" && st !== "active" && st !== "pending") {
    c.signOut();
    throw new Error(st === "none" ? "Esta cuenta no tiene acceso a la tienda. Si eres vendedor nuevo, usa tu código de invitación." : INVITE_MESSAGES[st] || `No se pudo entrar (${st}).`);
  }
  b.setSetting("cloudConfig", conf);
  try {
    const me = await c.select("members", `select=name&user_id=eq.${c.userId}`);
    if (me?.[0]?.name && st !== "owner") b.setSetting("sellerName", me[0].name);
  } catch {}
  return st as LoginResult;
}

const field = (label: string, value: string, set: (v: string) => void, opts: { secure?: boolean; kind?: any; placeholder?: string } = {}) => (
  <View style={s.field} key={label}>
    <Text style={s.label}>{label}</Text>
    <TextInput
      accessibilityLabel={label}
      style={s.input}
      value={value}
      onChangeText={set}
      secureTextEntry={opts.secure}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={opts.kind}
      placeholder={opts.placeholder}
      placeholderTextColor={C.muted}
    />
  </View>
);

/** Olvidé mi contraseña: correo con código → contraseña nueva. */
export function PasswordReset({ conf, initialEmail = "", onDone, onBack }: { conf: CloudConfig; initialEmail?: string; onDone: (email: string) => void; onBack: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setMsg(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setMsg({ text: "Escribe el correo con el que entras a la app.", bad: true });
    setBusy(true);
    try {
      await new Cloud(conf, null).recover(email);
      setStep("code");
      setMsg({ text: `Si ${email.trim().toLowerCase()} tiene cuenta, te llegó un correo con un código. Revisa también Spam.` });
    } catch (e) {
      setMsg({ text: errText(e), bad: true });
    } finally {
      setBusy(false);
    }
  }
  async function change() {
    setMsg(null);
    if (code.replace(/\D/g, "").length < 6) return setMsg({ text: "Escribe el código que te llegó por correo.", bad: true });
    if (pw.length < 8) return setMsg({ text: "La contraseña nueva debe tener al menos 8 caracteres.", bad: true });
    if (pw !== pw2) return setMsg({ text: "Las contraseñas no coinciden.", bad: true });
    setBusy(true);
    try {
      const c = new Cloud(conf, null);
      await c.verifyRecovery(email, code);
      await c.updatePassword(pw);
      c.signOut();
      onDone(email.trim().toLowerCase());
    } catch (e) {
      setMsg({ text: errText(e), bad: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={[s.content, { paddingTop: 30 }]} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Recuperar contraseña</Text>
        {!!msg && <Note color={msg.bad ? C.red : C.ink}>{msg.text}</Note>}
        <View style={{ height: 10 }} />
        {field("Tu correo", email, setEmail, { kind: "email-address", placeholder: "tucorreo@gmail.com" })}
        {step === "email" ? (
          <Button icon="mail" title={busy ? "Enviando…" : "Enviarme el correo"} disabled={busy} onPress={() => void send()} />
        ) : (
          <>
            {field("Código del correo", code, (v) => setCode(v.replace(/\D/g, "").slice(0, 10)), { kind: "number-pad", placeholder: "123456" })}
            {field("Contraseña nueva (mínimo 8)", pw, setPw, { secure: true })}
            {field("Repite la contraseña nueva", pw2, setPw2, { secure: true })}
            <Button title={busy ? "Guardando…" : "Guardar contraseña nueva"} disabled={busy} onPress={() => void change()} />
            <Button title="Reenviar correo" secondary small disabled={busy} onPress={() => void send()} />
          </>
        )}
        <View style={{ height: 14 }} />
        <Button title="Volver" secondary small onPress={onBack} />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Primera pantalla en un teléfono sin datos: entrar con correo y contraseña,
 * recuperar la contraseña o crear cuenta de vendedor con código de invitación.
 */
export function LoginScreen({ b, onLogged, onNewSeller }: { b: Business; onLogged: (role: LoginResult) => void; onNewSeller: () => void }) {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const conf: CloudConfig = b.setting("cloudConfig", null) || storeCloud();
  // Atrás en "Olvidé mi contraseña" regresa al inicio de sesión (no cierra la app).
  useEffect(() => {
    if (mode !== "reset") return;
    const sub = BackHandler?.addEventListener?.("hardwareBackPress", () => (setMode("login"), true));
    return () => sub?.remove();
  }, [mode]);
  async function enter() {
    setMsg(null);
    setBusy(true);
    try {
      const role = await loginHere(b, email, password, conf);
      setPassword("");
      onLogged(role);
    } catch (e) {
      setMsg({ text: errText(e), bad: true });
    } finally {
      setBusy(false);
    }
  }
  if (mode === "reset")
    return (
      <PasswordReset
        conf={conf}
        initialEmail={email}
        onBack={() => setMode("login")}
        onDone={(e) => {
          setEmail(e);
          setPassword("");
          setMode("login");
          setMsg({ text: "Listo: contraseña cambiada. Entra con tu contraseña nueva." });
        }}
      />
    );
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={[s.content, { paddingTop: 34 }]} keyboardShouldPersistTaps="handled">
        <Image source={LOGO_FULL} accessibilityLabel="GGG · Nova Supps" resizeMode="contain" style={{ width: 220, height: 220 / LOGO_FULL_RATIO, marginBottom: 26, alignSelf: "center" }} />
        <Text style={[s.title, { textAlign: "center" }]}>Inicia sesión</Text>
        <Text style={[s.muted, { textAlign: "center", marginHorizontal: 12 }]}>Entra con tu correo y tu contraseña. Este teléfono quedará como el de tu cuenta.</Text>
        <View style={{ height: 18 }} />
        {!!msg && (
          <View style={msg.bad ? s.errorBox : undefined}>
            <Text style={[s.body, { color: msg.bad ? C.red : C.green, marginBottom: 10 }]}>{msg.text}</Text>
          </View>
        )}
        {field("Correo", email, setEmail, { kind: "email-address", placeholder: "tucorreo@gmail.com" })}
        {field("Contraseña", password, setPassword, { secure: true })}
        <Button title={busy ? "Entrando…" : "Entrar"} disabled={busy} onPress={() => void enter()} />
        <Button title="¿Olvidaste tu contraseña?" secondary small disabled={busy} onPress={() => (setMsg(null), setMode("reset"))} />
        <View style={{ height: 22 }} />
        <Card>
          <Text style={s.subtitle}>¿Eres vendedor nuevo?</Text>
          <Note>Crea tu cuenta con el código de invitación que te dio el dueño.</Note>
          <Button title="Tengo un código de invitación" secondary small onPress={onNewSeller} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
