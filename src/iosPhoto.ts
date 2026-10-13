// iPhone: foto del producto desde Fotos, la cámara o Archivos. Cualquier formato
// (HEIC, PNG, capturas grandes…) se convierte a JPG de máximo 1024 px antes de
// guardarse. Los módulos nativos se cargan solo aquí y solo en iPhone: la app de
// Android no los trae y nunca los evalúa.
import { ActionSheetIOS } from "react-native";
import * as Picker from "expo-document-picker";
import type * as ImagePickerT from "expo-image-picker";
import type * as ManipulatorT from "expo-image-manipulator";
import { MAX_SIDE } from "./photos";

export type PickedPhoto = { uri: string; mimeType?: string | null; size?: number | null };

function chooseSource(): Promise<"photos" | "camera" | "files" | null> {
  return new Promise((resolve) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: "Foto del producto", options: ["Cancelar", "Elegir de Fotos", "Tomar foto", "Elegir de Archivos"], cancelButtonIndex: 0 },
      (i) => resolve(i === 1 ? "photos" : i === 2 ? "camera" : i === 3 ? "files" : null),
    ),
  );
}

/** Convierte la imagen a JPG con el lado mayor de máximo 1024 px. */
export async function toJpeg(uri: string): Promise<PickedPhoto> {
  const M: typeof ManipulatorT = require("expo-image-manipulator");
  const original = await M.ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = original;
  const ctx = M.ImageManipulator.manipulate(original);
  if (Math.max(width, height) > MAX_SIDE) ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: M.SaveFormat.JPEG });
  try {
    original.release();
    image.release();
  } catch {}
  return { uri: saved.uri, mimeType: "image/jpeg", size: null };
}

/** Pide la foto en iPhone. null = el usuario canceló. */
export async function pickPhotoIOS(): Promise<PickedPhoto | null> {
  const source = await chooseSource();
  if (!source) return null;
  let uri: string;
  if (source === "files") {
    const r = await Picker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.length) return null;
    uri = r.assets[0].uri;
  } else {
    const IP: typeof ImagePickerT = require("expo-image-picker");
    const options: ImagePickerT.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 1,
      preferredAssetRepresentationMode: IP.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    };
    if (source === "camera") {
      const perm = await IP.requestCameraPermissionsAsync();
      if (!perm.granted) throw new Error("Permite el acceso a la cámara en Ajustes → Nova Negocio → Cámara para tomar la foto.");
    }
    const r = source === "camera" ? await IP.launchCameraAsync(options) : await IP.launchImageLibraryAsync(options);
    if (r.canceled || !r.assets?.length) return null;
    uri = r.assets[0].uri;
  }
  try {
    return await toJpeg(uri);
  } catch {
    throw new Error("No se pudo leer esa foto. Prueba con otra o con una captura de pantalla.");
  }
}
