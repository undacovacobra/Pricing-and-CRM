// VAPID public key — this is PUBLIC by design (it's sent to the browser to
// create a push subscription), so it's safe to commit. The matching PRIVATE
// key lives only in the VAPID_PRIVATE_KEY environment variable on Vercel.
export const VAPID_PUBLIC_KEY =
  "BFn9R14xCYUB9FHNIoXa84xIbX4AiuGBFOPj4Mvdh7He6BljzkV0Pgmv43fUzY64tzFZVwNpKMnKyrx5j8WanSQ";

// Converts a base64url VAPID key into the Uint8Array the Push API expects.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
