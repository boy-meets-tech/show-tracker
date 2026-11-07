// Show Tracker service worker: shows push notifications and opens the right
// page when one is tapped.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Tell the server what happened, so problems on phones show up in its logs.
function report(stage, tag, error) {
  return fetch("/api/push-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage, tag, error: error ? String(error) : undefined }),
  }).catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // iPhones require every push to show a notification, so always show one.
  // Only use options every browser supports.
  const show = self.registration
    .showNotification(data.title || "Show Tracker", {
      body: data.body || "",
      icon: "/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    })
    .then(
      () => report("shown", data.tag),
      (err) => report("show-failed", data.tag, err)
    );
  event.waitUntil(Promise.all([report("received", data.tag), show]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
