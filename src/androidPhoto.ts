import { Alert } from "react-native";
import * as Picker from "expo-document-picker";
import { hasNative } from "./native";
import { toJpeg, type PickedPhoto } from "./iosPhoto";

export function chooseAndroidPhotoSource(): Promise<
  "photos" | "camera" | "files" | null
> {
  return new Promise((resolve) =>
    Alert.alert(
      "Foto del producto",
      "Elige de dónde tomarla.",
      [
        { text: "Elegir de Fotos", onPress: () => resolve("photos") },
        { text: "Tomar foto", onPress: () => resolve("camera") },
        {
          text: "Archivos o cancelar",
          onPress: () =>
            Alert.alert(
              "Foto del producto",
              "Elige una imagen guardada o vuelve al producto.",
              [
                {
                  text: "Cancelar",
                  style: "cancel",
                  onPress: () => resolve(null),
                },
                { text: "Elegir de Archivos", onPress: () => resolve("files") },
              ],
              { cancelable: true, onDismiss: () => resolve(null) },
            ),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    ),
  );
}

export async function pickPhotoAndroid(): Promise<PickedPhoto | null> {
  const source = hasNative("ExponentImagePicker")
    ? await chooseAndroidPhotoSource()
    : "files";
  if (!source) return null;
  let file: PickedPhoto;
  if (source === "files") {
    const r = await Picker.getDocumentAsync({
      type: "image/*",
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.length) return null;
    file = r.assets[0];
  } else {
    const IP: typeof import("expo-image-picker") = require("expo-image-picker");
    if (source === "camera") {
      const permission = await IP.requestCameraPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Permite la cámara en Ajustes → Apps → Nova Negocio para tomar la foto.",
        );
    }
    const options = { mediaTypes: ["images"] as "images"[], quality: 1 };
    const r =
      source === "camera"
        ? await IP.launchCameraAsync(options)
        : await IP.launchImageLibraryAsync(options);
    if (r.canceled || !r.assets?.length) return null;
    file = r.assets[0];
  }
  if ((file.size || 0) > 15_000_000)
    throw new Error("La foto pesa más de 15 MB. Elige otra imagen.");
  if (hasNative("ExpoImageManipulator")) {
    try {
      return await toJpeg(file.uri);
    } catch {
      throw new Error("No se pudo optimizar esa foto. Prueba con otra imagen.");
    }
  }
  return file;
}
