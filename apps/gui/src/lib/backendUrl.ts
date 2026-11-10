import { resolveBackendUrl } from './apiDestination';

export const BACKEND_URL = resolveBackendUrl(import.meta.env.VITE_BACKEND_URL, import.meta.env.DEV, window.location.origin);
