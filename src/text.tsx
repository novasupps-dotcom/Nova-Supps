// 2.4 · Texto con Inter: convierte el peso (fontWeight) en la familia de Inter que le toca
// y aplica el espaciado óptico. Si Inter no está lista, usa la letra del sistema tal cual.
import React from "react";
import { Text as RNText, TextInput as RNTextInput } from "react-native";
import { familyFor, fontsReady, trackingFor } from "./fonts";

function flatten(style: any): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return typeof style === "object" ? style : {};
}

function premium(style: any) {
  if (!fontsReady()) return style;
  const f = flatten(style);
  if (f.fontFamily) return style;
  const size = typeof f.fontSize === "number" ? f.fontSize : 14;
  return [
    style,
    {
      fontFamily: familyFor(f.fontWeight, size),
      // La familia ya trae el grosor: sin esto Android lo engrosaría dos veces.
      fontWeight: "normal",
      ...(f.letterSpacing === undefined ? { letterSpacing: trackingFor(size) } : null),
    },
  ];
}

export const Text = React.forwardRef<any, React.ComponentProps<typeof RNText>>(function Text(props, ref) {
  return <RNText {...props} ref={ref} style={premium(props.style)} />;
});

export const TextInput = React.forwardRef<any, React.ComponentProps<typeof RNTextInput>>(function TextInput(props, ref) {
  let style = props.style;
  if (fontsReady()) {
    const f = flatten(props.style);
    style = [props.style, { fontFamily: f.fontFamily || familyFor(f.fontWeight, 16), fontWeight: "normal" as const }];
  }
  return <RNTextInput {...props} ref={ref} style={style} />;
});
