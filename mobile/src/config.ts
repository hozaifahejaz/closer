import { Platform } from 'react-native';

// Experiments build: the app talks to the preview server built from the
// `experiments` branch, never the live one. Previews have no database key, so
// accounts are off there and only guest rooms work; no live data is touched.
// On web (only used for previews) the page is served from the server itself,
// so it uses its own address.
const LIVE = 'https://experiments-closer.hozaiphaa.workers.dev';

export const SERVER = Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : LIVE;
export const WEBSITE = LIVE;
export const socketUrl = (path: string) => SERVER.replace(/^http/, 'ws') + path;
