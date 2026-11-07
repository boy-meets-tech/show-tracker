// The service worker reports here when a push arrives and whether it could
// show the notification, so delivery problems on phones show up in the logs.
export async function POST(request: Request) {
  let body: { stage?: unknown; tag?: unknown; error?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // ignore malformed reports
  }
  const clean = (v: unknown) => String(v ?? "").slice(0, 200).replace(/[\r\n]/g, " ");
  console.log(
    `push-device: ${clean(body.stage)} tag=${clean(body.tag)}` +
      (body.error ? ` error=${clean(body.error)}` : "") +
      ` ua=${clean(request.headers.get("user-agent")).slice(0, 80)}`
  );
  return new Response(null, { status: 204 });
}
