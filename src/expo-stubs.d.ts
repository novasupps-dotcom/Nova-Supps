declare module "expo-file-system/legacy" {
  export const documentDirectory: string;
  export const cacheDirectory: string;
  export const EncodingType: { Base64: string };
  export function readAsStringAsync(uri: string, options?: any): Promise<string>;
  export function writeAsStringAsync(uri: string, value: string, options?: any): Promise<void>;
  export function makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  export function readDirectoryAsync(uri: string): Promise<string[]>;
  export function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  export function getInfoAsync(uri: string, options?: any): Promise<{ exists: boolean; size?: number; uri?: string }>;
  export function downloadAsync(uri: string, fileUri: string, options?: any): Promise<{ status: number; uri: string }>;
}
declare module "expo-sharing" {
  export function isAvailableAsync(): Promise<boolean>;
  export function shareAsync(uri: string, options?: any): Promise<void>;
}
declare module "expo-document-picker" {
  export function getDocumentAsync(options?: any): Promise<any>;
}
declare module "expo-local-authentication" {
  export function hasHardwareAsync(): Promise<boolean>;
  export function isEnrolledAsync(): Promise<boolean>;
  export function authenticateAsync(options?: any): Promise<{ success: boolean }>;
}
