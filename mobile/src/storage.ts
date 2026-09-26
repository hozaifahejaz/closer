import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// The sign-in token lives in the phone's keychain (iOS) or keystore (Android),
// so it stays until the person logs out. Web previews fall back to localStorage.
const web = Platform.OS === 'web';
// SecureStore only accepts letters, digits, '.', '-' and '_' in keys (it throws on
// 'closer:token'), so keys are stored as e.g. 'closer.token' on phones.
const secureKey = (key: string) => key.replace(/[^\w.-]/g, '.');

export async function getItem(key: string): Promise<string | null> {
  try { return web ? localStorage.getItem(key) : await SecureStore.getItemAsync(secureKey(key)); } catch { return null; }
}

export async function setItem(key: string, value: string | null): Promise<void> {
  try {
    if (web) value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    else if (value === null) await SecureStore.deleteItemAsync(secureKey(key));
    else await SecureStore.setItemAsync(secureKey(key), value);
  } catch {}
}
