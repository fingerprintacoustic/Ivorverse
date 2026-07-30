export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  // Still used by webSearch.ts (Google search/news/stock via dataApi.ts),
  // map.ts (Google Maps), and notification.ts. These are Manus's Forge API
  // proxy — a separate, deliberate decision from the OAuth/session removal,
  // since replacing them means wiring real Google/Maps/push-notification
  // providers directly.
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
