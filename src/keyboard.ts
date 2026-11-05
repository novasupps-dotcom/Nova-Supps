// 2.9 · Teclado: que el campo donde escribes siempre quede a la vista.
// En Android (pantalla completa, edge-to-edge) la ventana ya no se encoge sola al abrir el
// teclado; por eso: 1) la pantalla deja espacio al teclado (KeyboardAvoidingView «padding»)
// y 2) la lista o formulario que está al frente se desplaza hasta el campo enfocado.
// Solo JavaScript: llega por actualización OTA, sin APK nuevo.
import { useEffect, useRef } from "react";
import { Keyboard, Platform, TextInput, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

type Follower = { follow: (keyboardTop: number) => void };
const stack: Follower[] = [];
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  (Keyboard as any)?.addListener?.("keyboardDidShow", (e: any) => {
    const top = stack[stack.length - 1];
    const y = e?.endCoordinates?.screenY;
    if (!top || typeof y !== "number") return;
    // Deja que la pantalla termine de acomodarse antes de medir.
    setTimeout(() => top.follow(y), Platform.OS === "android" ? 140 : 60);
  });
}

/** Margen entre el campo y el teclado. */
const GAP = 24;

/**
 * Para un ScrollView o FlatList: regresa `onScroll` (lleva la cuenta de dónde va) y se
 * encarga de desplazarse al campo enfocado cuando aparece el teclado. Solo la lista que
 * está al frente (la última activada, por ejemplo un formulario abierto) responde.
 */
export function useKeyboardFollow(ref: { current: any }, enabled = true) {
  const offset = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    listen();
    const me: Follower = {
      follow: (keyboardTop) => {
        const input: any = (TextInput as any).State?.currentlyFocusedInput?.();
        const list = ref.current;
        if (!input?.measureInWindow || !list) return;
        input.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          const covered = y + h + GAP - keyboardTop;
          if (!(covered > 0)) return;
          const to = Math.max(0, offset.current + covered);
          if (typeof list.scrollToOffset === "function") list.scrollToOffset({ offset: to, animated: true });
          else if (typeof list.scrollTo === "function") list.scrollTo({ y: to, animated: true });
        });
      },
    };
    stack.push(me);
    return () => {
      const i = stack.lastIndexOf(me);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [ref, enabled]);
  return {
    offset,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
    },
  };
}

/** Comportamiento de KeyboardAvoidingView: en iOS y en Android se deja el espacio del teclado. */
export const KEYBOARD_BEHAVIOR = "padding" as const;
