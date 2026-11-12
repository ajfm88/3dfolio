import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";

const previousKey = process.env.IK_PRIVATE_KEY;
process.env.IK_PRIVATE_KEY = "imagekit-unit-test-key";

const { getImageKitClient, uploadChatMedia } = await import("../src/lib/imagekit.js");

describe("uploadChatMedia folder", () => {
  const client = getImageKitClient();
  const calls = [];
  mock.method(client.files, "upload", async (args) => {
    calls.push(args);
    return { url: "https://cdn.example/uploaded" };
  });

  after(() => {
    client.files.upload.mock.restore();
    if (previousKey === undefined) delete process.env.IK_PRIVATE_KEY;
    else process.env.IK_PRIVATE_KEY = previousKey;
  });

  it("keeps /chat as the default and passes /collaborate through, with the same url and mime", async () => {

    const file = {
      buffer: Buffer.from("hello"),
      originalname: "plan.png",
      mimetype: "image/png",
    };
    const def = await uploadChatMedia(file);
    const project = await uploadChatMedia(file, "/collaborate");

    assert.equal(def, "https://cdn.example/uploaded");
    assert.equal(project, "https://cdn.example/uploaded");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].folder, "/chat");
    assert.equal(calls[1].folder, "/collaborate");
    assert.equal(calls[0].file.type, "image/png");
    assert.equal(calls[1].file.type, "image/png");
    assert.match(calls[0].fileName, /^chat-\d+-plan\.png$/);
    assert.match(calls[1].fileName, /^chat-\d+-plan\.png$/);
  });
});
