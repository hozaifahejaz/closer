import { resolveServer, tokenStorageKey } from './serverConfig';

// Expo replaces these explicit EXPO_PUBLIC references while bundling. They
// contain public origins only; credentials never belong in these variables.
const config = resolveServer(process.env.EXPO_PUBLIC_CLOSER_SERVER, process.env.EXPO_PUBLIC_CLOSER_ENVIRONMENT, __DEV__);
export const SERVER = config.server;
export const CONFIG_ERROR = config.error;
export const TOKEN_KEY = tokenStorageKey(SERVER);
export const WEBSITE = SERVER;
export const socketUrl = (path: string) => SERVER.replace(/^http/, 'ws') + path;
