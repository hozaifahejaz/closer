import { Platform } from 'react-native';

// The apps talk to the same server (and so the same rooms, accounts and saved
// answers) as the website. On web (only used for previews) the page is served
// from the server itself, so it uses its own address.
const LIVE = 'https://closer.hozaiphaa.workers.dev';

export const SERVER = Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : LIVE;
export const WEBSITE = LIVE;
export const socketUrl = (path: string) => SERVER.replace(/^http/, 'ws') + path;
