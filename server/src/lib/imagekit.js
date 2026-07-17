import ImageKit from "@imagekit/nodejs";

// Built lazily, not at module load: `new ImageKit()` throws synchronously if
// privateKey is undefined, and this module is imported by post.route.js on
// every server boot — so constructing it eagerly would crash `npm run dev`
// the moment IK_PRIVATE_KEY isn't set yet, same as it would for every other
// slice built before its third-party keys existed. Cached after first build.
let client;

export function getImageKitClient() {
  if (!process.env.IK_PRIVATE_KEY) return null;
  if (!client) {
    client = new ImageKit({ privateKey: process.env.IK_PRIVATE_KEY });
  }
  return client;
}
