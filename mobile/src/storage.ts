import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// The sign-in token lives in the phone's keychain (iOS) or keystore (Android),
// so it stays until the person logs out. Web previews fall back to localStorage.
const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  try { return web ? localStorage.getItem(key) : await SecureStore.getItemAsync(key); } catch { return null; }
}

export async function setItem(key: string, value: string | null): Promise<void> {
  try {
    if (web) value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    else if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {}
}
