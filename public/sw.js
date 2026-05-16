// Minimal service worker. Required by Chrome to register the app as
// installable. No offline support in v1 — every fetch passes through
// to the network.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op handler so the SW is considered "controlling" by Chrome.
});
