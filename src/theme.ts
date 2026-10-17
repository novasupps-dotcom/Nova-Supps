// 2.3 · Estilo minimalista inspirado en iOS (pensado para Android): fondo gris muy claro,
// tarjetas blancas sin bordes, texto negro y un solo acento, el rojo del logo GGG · Nova Supps.
// El dorado queda solo en el logo. Verde y ámbar solo para estados (cobrado, pendiente).
export const BRAND = {
  red: "#D9252F",
  redDark: "#A3161E",
  gold: "#D4A63A",
  goldLight: "#F3D27A",
  black: "#1C1C1E",
  white: "#FFFFFF",
};

export const C = {
  /** Fondo de pantalla (gris agrupado). */
  bg: "#F2F2F7",
  /** Tarjetas, listas y barras. */
  paper: "#FFFFFF",
  ink: BRAND.black,
  /** Texto secundario (contraste 5:1 sobre blanco). */
  muted: "#6C6C70",
  /** Flechas, marcadores de posición y elementos de tercer nivel. */
  faint: "#AEAEB2",
  /** Separadores finos. */
  line: "#E3E3E8",
  inputLine: "#D1D1D6",
  /** Relleno de botones grises, chips y buscador. */
  fill: "#E9E9EE",
  soft: "#F2F2F7",
  brand: BRAND.red,
  brandDark: BRAND.redDark,
  brandSoft: "#FDECEC",
  gold: BRAND.gold,
  goldSoft: "#FBF4DF",
  /** Fondo de insignias y selección suave. */
  accent: "#F2F2F7",
  red: "#C4161C",
  redSoft: "#FDECEC",
  redLine: "#F5C6C8",
  amber: "#9A5B00",
  amberSoft: "#FFF4E0",
  amberLine: "#F2D9A8",
  green: "#1F7A3D",
  greenSoft: "#E7F5EC",
  greenLine: "#BFE3CC",
  /** Fondo oscuro (lector de códigos, avisos flotantes). */
  dark: "#1C1C1E",
  /** Pestaña sin seleccionar. */
  tab: "#7C7C80",
};

/** Colores de los cuadritos de ícono en las listas de Ajustes (como en iOS, sobrios). */
export const TILE = {
  red: BRAND.red,
  gold: "#C8962E",
  graphite: "#48484A",
  green: "#2E8B57",
  blue: "#3A6EA5",
};

/** Nombre de la tienda en comprobantes, catálogo y mensajes (logo oficial). */
export const STORE_NAME = "GGG · Nova Supps";
