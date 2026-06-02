/** Role picker lives only on portal-hub (default port 8080). */
export const PORTAL_HUB_URL = (
  import.meta.env.VITE_PORTAL_HUB_URL || 'http://localhost:8080'
).replace(/\/$/, '');
