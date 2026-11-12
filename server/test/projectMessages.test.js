import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import ProjectMessage from "../src/models/projectMessage.model.js";
import {
  canonicalObjectId,
  HISTORY_BEFORE_MESSAGE,
  historyFilter,
  pageHistory,
  parseHistoryQuery,
  parseMessageText,
  PROJECT_MESSAGE_PAGE_LIMIT,
  PROJECT_MESSAGE_TEXT_MAX,
  toMessageResource,
} from "../src/lib/projectMessages.js";

const projectId = new mongoose.Types.ObjectId();
const senderId = new mongoose.Types.ObjectId();
const ISO = "2026-11-11T12:00:00.000Z";

function validMessage(overrides = {}) {
  return new ProjectMessage({
    project: projectId,
    sender: senderId,
    text: "Hello",
    ...overrides,
  });
}

describe("project message schema", () => {
  it("accepts text, defaults empty media, and names the collection and index", async () => {
    const message = validMessage();
    await message.validate();
    assert.equal(message.text, "Hello");
    assert.equal(message.image, "");
    assert.equal(message.video, "");
    assert.equal(message.schema.options.timestamps, true);
    assert.equal(ProjectMessage.schema.options.collection, "projectmessages");
    assert.deepEqual(ProjectMessage.schema.indexes().map(([keys]) => keys), [
      { project: 1, createdAt: -1, _id: -1 },
    ]);
  });

  it("accepts one media url without text and rejects two media kinds or no content", async () => {
    await validMessage({ text: "", image: "https://cdn.example/a.png" }).validate();
    await validMessage({ text: "  ", video: "https://cdn.example/a.mp4" }).validate();
    await assert.rejects(validMessage({ text: "", image: "", video: "" }).validate(), (error) => {
      assert.ok(error.errors.text);
      return true;
    });
    await assert.rejects(validMessage({ text: "   " }).validate(), (error) => {
      assert.ok(error.errors.text);
      return true;
    });
    await assert.rejects(
      validMessage({ text: "", image: "https://cdn.example/a.png", video: "https://cdn.example/a.mp4" }).validate(),
      (error) => {
        assert.ok(error.errors.image);
        return true;
      },
    );
  });

  it("accepts 2000 characters and rejects 2001, missing refs, and non-strings", async () => {
    await validMessage({ text: "a".repeat(PROJECT_MESSAGE_TEXT_MAX) }).validate();
    await assert.rejects(validMessage({ text: "a".repeat(PROJECT_MESSAGE_TEXT_MAX + 1) }).validate(), (error) => {
      assert.ok(error.errors.text);
      return true;
    });
    await assert.rejects(validMessage({ project: undefined }).validate(), (error) => {
      assert.ok(error.errors.project);
      return true;
    });
    await assert.rejects(validMessage({ sender: undefined }).validate(), (error) => {
      assert.ok(error.errors.sender);
      return true;
    });
    for (const value of [12, ["hello"], { text: "hello" }]) {
      await assert.rejects(validMessage({ text: value }).validate(), (error) => {
        assert.equal(error.errors.text?.name, "CastError");
        return true;
      });
    }
  });
});

describe("project message helpers", () => {
  it("parses a canonical cursor and rejects bad limits without changing the query", () => {
    const beforeId = senderId.toHexString().toUpperCase();
    const query = { limit: "10", before: ISO, beforeId, extra: "ignored" };
    const frozen = Object.freeze({ ...query });
    const parsed = parseHistoryQuery(frozen);
    assert.deepEqual(frozen, query);
    assert.deepEqual(parsed, {
      ok: true,
      limit: 10,
      before: ISO,
      beforeId: beforeId.toLowerCase(),
    });
    assert.deepEqual(parseHistoryQuery({}), {
      ok: true,
      limit: PROJECT_MESSAGE_PAGE_LIMIT,
      before: null,
      beforeId: null,
    });

    for (const limit of ["0", "51", "10abc", "10.5", " 10", "+10", "01", "", ["10"], { n: "10" }, 10]) {
      assert.equal(parseHistoryQuery({ limit }).ok, false, `limit ${JSON.stringify(limit)}`);
    }
    assert.equal(parseHistoryQuery({ before: "2026-11-11T12:00:00Z" }).ok, false);
    assert.deepEqual(parseHistoryQuery({ before: "" }), {
      ok: false,
      message: HISTORY_BEFORE_MESSAGE,
    });
    assert.equal(parseHistoryQuery({ before: ["2026-11-11T12:00:00.000Z"] }).ok, false);
    assert.equal(parseHistoryQuery({ beforeId: beforeId }).ok, false);
    assert.equal(parseHistoryQuery({ before: ISO, beforeId: "not-an-id" }).ok, false);
    assert.equal(parseHistoryQuery({ before: ISO, beforeId: [beforeId] }).ok, false);
  });

  it("builds a project-scoped filter and does not mutate the parsed cursor", () => {
    const parsed = { before: ISO, beforeId: senderId.toHexString() };
    const filter = historyFilter(projectId.toHexString(), parsed);
    assert.deepEqual(parsed, { before: ISO, beforeId: senderId.toHexString() });
    assert.deepEqual(filter, {
      project: projectId.toHexString(),
      $or: [
        { createdAt: { $lt: new Date(ISO) } },
        { createdAt: new Date(ISO), _id: { $lt: senderId.toHexString() } },
      ],
    });
    assert.deepEqual(historyFilter(projectId.toHexString(), { before: ISO, beforeId: null }), {
      project: projectId.toHexString(),
      createdAt: { $lt: new Date(ISO) },
    });
    assert.deepEqual(historyFilter(projectId.toHexString(), { before: null, beforeId: null }), {
      project: projectId.toHexString(),
    });
  });

  it("trims outer whitespace after the length check and rejects non-strings", () => {
    const body = { text: "  line\n\nnext  ", image: "https://forged.example" };
    const frozen = Object.freeze({ ...body });
    assert.deepEqual(parseMessageText(frozen), { ok: true, text: "line\n\nnext" });
    assert.deepEqual(frozen, body);
    assert.deepEqual(parseMessageText({}), { ok: true, text: "" });
    assert.equal(parseMessageText({ text: "a".repeat(2000) }).ok, true);
    assert.equal(parseMessageText({ text: ` ${"a".repeat(2000)}` }).ok, false);
    for (const text of [null, 12, ["hi"], { text: "hi" }]) {
      assert.equal(parseMessageText({ text }).ok, false);
    }
  });

  it("whitelists the resource and pages newest-first rows oldest-first without mutating them", () => {
    const older = new Date("2026-11-11T12:00:00.000Z");
    const newer = new Date("2026-11-11T12:00:01.000Z");
    const rows = [
      {
        _id: senderId,
        project: projectId,
        sender: { _id: senderId, fullName: "Ada", img: "", email: "ada@example.com", clerkId: "clerk" },
        text: "new",
        image: "",
        video: "",
        createdAt: newer,
        updatedAt: newer,
        __v: 2,
      },
      {
        _id: projectId,
        project: projectId,
        sender: null,
        text: "",
        image: "https://cdn.example/a.png",
        video: "",
        createdAt: older,
        updatedAt: older,
      },
    ];
    const order = rows.map((row) => row._id);
    const page = pageHistory(rows, 1);
    assert.deepEqual(rows.map((row) => row._id), order);
    assert.equal(page.hasMore, true);
    assert.equal(page.messages.length, 1);
    assert.equal(page.messages[0]._id, senderId.toHexString());
    assert.equal(page.messages[0].image, "");
    assert.equal(page.nextCursor.before, newer.toISOString());
    assert.equal(page.nextCursor.beforeId, senderId.toHexString());
    assert.equal(Object.hasOwn(page.messages[0], "__v"), false);
    assert.equal(Object.hasOwn(page.messages[0].sender, "email"), false);
    const both = pageHistory(rows, 2);
    assert.equal(both.hasMore, false);
    assert.deepEqual(both.messages.map((row) => row._id), [projectId.toHexString(), senderId.toHexString()]);
    assert.equal(both.messages[0].sender, null);

    const only = pageHistory([rows[0]], 50);
    assert.equal(only.hasMore, false);
    assert.equal(only.nextCursor, null);
    assert.deepEqual(only.messages[0].sender, {
      _id: senderId.toHexString(),
      fullName: "Ada",
      img: "",
    });
    assert.equal(Object.hasOwn(only.messages[0].sender, "email"), false);
    assert.equal(Object.hasOwn(only.messages[0].sender, "clerkId"), false);
    assert.deepEqual(toMessageResource(rows[0]).sender, only.messages[0].sender);
    assert.equal(canonicalObjectId(senderId), senderId.toHexString());

    const empty = pageHistory([], 50);
    assert.deepEqual(empty, { messages: [], hasMore: false, nextCursor: null });
  });
});
