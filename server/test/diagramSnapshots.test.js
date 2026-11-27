import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { MAX_DIAGRAM_BYTES } from "../src/lib/diagramAccess.js";
import {
  SHARE_FILENAME,
  VERSION_FILENAME,
  newShareId,
  newVersionId,
  pageVersions,
  parseShareId,
  parseSnapshotContent,
  parseVersionCursor,
  parseVersionId,
  parseVersionLimit,
  shapeShareFile,
  shapeVersionFile,
  shapeVersionItem,
  versionsToPrune,
} from "../src/lib/diagramSnapshots.js";
import DiagramShare from "../src/models/diagramShare.model.js";
import DiagramVersion from "../src/models/diagramVersion.model.js";

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    versionId: index.toString(16).padStart(40, "0"),
    _id: `row-${index}`,
  }));
}

describe("diagram snapshots", () => {
  it("rejects snapshot content that is not text, not an object, or missing a tables list", () => {
    const cases = [
      [1, 400, "Snapshot content must be text"],
      [null, 400, "Snapshot content must be text"],
      ["[]", 400, "Snapshot content must be a JSON object"],
      ["null", 400, "Snapshot content must be a JSON object"],
      ['"text"', 400, "Snapshot content must be a JSON object"],
      ["{bad", 400, "Snapshot content must be a JSON object"],
      ["{}", 400, "Snapshot content must have a tables list"],
      ['{"tables":{}}', 400, "Snapshot content must have a tables list"],
    ];
    for (const [value, status, message] of cases) {
      const result = parseSnapshotContent(value);
      assert.equal(result.ok, false, String(value));
      assert.equal(result.status, status, String(value));
      assert.equal(result.message, message, String(value));
    }
  });

  it("normalizes JSON, counts UTF-8 bytes, and hashes the normalized text", () => {
    const raw = '{ "tables": [] , "name": "café" }';
    const result = parseSnapshotContent(raw);
    assert.equal(result.ok, true);
    assert.equal(result.value.content, '{"tables":[],"name":"café"}');
    assert.equal(result.value.sizeBytes, Buffer.byteLength(result.value.content, "utf8"));
    assert.notEqual(result.value.sizeBytes, result.value.content.length);
    assert.equal(result.value.contentHash, sha256(result.value.content));
    assert.match(result.value.contentHash, /^[0-9a-f]{64}$/);

    const spaced = parseSnapshotContent('{ "tables" : [ ] , "name" : "café" }');
    assert.equal(spaced.value.contentHash, result.value.contentHash);
    assert.equal(spaced.value.content, result.value.content);

    const ordered = parseSnapshotContent('{ "tables": [] , "a": 1 }');
    assert.equal(ordered.value.content, '{"tables":[],"a":1}');
  });

  it("allows exactly 1 MiB and rejects one byte more", () => {
    const overhead = Buffer.byteLength('{"tables":[],"pad":""}', "utf8");
    assert.equal(overhead, 22);
    const exact = `{"tables":[],"pad":"${"x".repeat(MAX_DIAGRAM_BYTES - overhead)}"}`;
    assert.equal(Buffer.byteLength(exact, "utf8"), MAX_DIAGRAM_BYTES);
    const allowed = parseSnapshotContent(exact);
    assert.equal(allowed.ok, true);
    assert.equal(allowed.value.sizeBytes, MAX_DIAGRAM_BYTES);

    const over = `{"tables":[],"pad":"${"x".repeat(MAX_DIAGRAM_BYTES - overhead + 1)}"}`;
    assert.equal(Buffer.byteLength(over, "utf8"), MAX_DIAGRAM_BYTES + 1);
    const rejected = parseSnapshotContent(over);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 413);
    assert.equal(rejected.message, "Diagram is too large");
  });

  it("accepts generated version and share ids and rejects malformed ones", () => {
    const versionId = "ab".repeat(20);
    const shareId = "Az09_-".repeat(3) + "AbCd";
    assert.equal(shareId.length, 22);
    assert.equal(parseVersionId(versionId), versionId);
    assert.equal(parseShareId(shareId), shareId);
    for (const value of [versionId.toUpperCase(), "a".repeat(39), "a".repeat(41), null, 1]) {
      assert.equal(parseVersionId(value), null, String(value));
    }
    for (const value of [`${"a".repeat(21)}+`, `${"a".repeat(21)}/`, "a".repeat(21), "a".repeat(23), null]) {
      assert.equal(parseShareId(value), null, String(value));
    }

    const versions = new Set(Array.from({ length: 100 }, () => newVersionId()));
    const shares = new Set(Array.from({ length: 100 }, () => newShareId()));
    assert.equal(versions.size, 100);
    assert.equal(shares.size, 100);
    for (const id of versions) assert.equal(parseVersionId(id), id);
    for (const id of shares) assert.equal(parseShareId(id), id);
  });

  it("parses version limit and cursor", () => {
    assert.equal(parseVersionLimit(undefined), 10);
    assert.equal(parseVersionLimit("1"), 1);
    assert.equal(parseVersionLimit("20"), 20);
    for (const value of ["0", "21", "1.5", "abc", " 5", ["1", "2"]]) {
      assert.equal(parseVersionLimit(value), null, String(value));
    }

    assert.deepEqual(parseVersionCursor(undefined), { ok: true, value: null });
    assert.deepEqual(parseVersionCursor(""), { ok: true, value: null });
    const id = "c".repeat(40);
    assert.deepEqual(parseVersionCursor(id), { ok: true, value: id });
    assert.deepEqual(parseVersionCursor(["a".repeat(40)]), { ok: false });
    assert.deepEqual(parseVersionCursor("zzz"), { ok: false });
  });

  it("pages versions newest first", () => {
    const all = rows(25);
    const first = pageVersions(all, { limit: 10, cursor: null });
    assert.equal(first.hasMore, true);
    assert.equal(first.cursor, all[9].versionId);
    assert.deepEqual(first.items.map((row) => row.versionId), all.slice(0, 10).map((row) => row.versionId));

    const second = pageVersions(all, { limit: 10, cursor: first.cursor });
    assert.deepEqual(second.items.map((row) => row.versionId), all.slice(10, 20).map((row) => row.versionId));
    const third = pageVersions(all, { limit: 10, cursor: second.cursor });
    assert.deepEqual(third.items.map((row) => row.versionId), all.slice(20, 25).map((row) => row.versionId));
    assert.equal(third.hasMore, false);
    assert.equal(third.cursor, null);

    const exact = rows(20);
    const exactSecond = pageVersions(exact, { limit: 10, cursor: exact[9].versionId });
    assert.equal(exactSecond.items.length, 10);
    assert.equal(exactSecond.hasMore, false);
    assert.equal(exactSecond.cursor, null);

    assert.deepEqual(pageVersions(all, { limit: 10, cursor: "f".repeat(40) }), {
      items: [],
      cursor: null,
      hasMore: false,
    });
    assert.deepEqual(pageVersions([], { limit: 10, cursor: null }), {
      items: [],
      cursor: null,
      hasMore: false,
    });
  });

  it("prunes only the rows past the newest 20", () => {
    const twentyOne = rows(21);
    assert.deepEqual(versionsToPrune(twentyOne), ["row-20"]);
    assert.deepEqual(versionsToPrune(twentyOne.slice(0, 20)), []);
    assert.deepEqual(versionsToPrune([]), []);
    assert.deepEqual(versionsToPrune(rows(23)), ["row-20", "row-21", "row-22"]);
  });

  it("shapes version items, version files, and share files", () => {
    const createdAt = new Date("2026-11-26T15:04:05.000Z");
    const updatedAt = new Date("2026-11-26T16:00:00.000Z");
    const version = {
      versionId: "ab".repeat(20),
      createdAt,
      sizeBytes: 12,
      content: "{\"tables\":[]}",
    };
    assert.deepEqual(shapeVersionItem(version), {
      version: version.versionId,
      committed_at: "2026-11-26T15:04:05.000Z",
      sizeBytes: 12,
    });
    assert.deepEqual(Object.keys(shapeVersionItem(version)).sort(), ["committed_at", "sizeBytes", "version"]);
    assert.deepEqual(shapeVersionFile(version), {
      id: version.versionId,
      committed_at: "2026-11-26T15:04:05.000Z",
      files: {
        [VERSION_FILENAME]: {
          filename: VERSION_FILENAME,
          size: 12,
          content: "{\"tables\":[]}",
        },
      },
    });
    assert.equal(VERSION_FILENAME, "versionned.json");

    const share = {
      shareId: "A".repeat(22),
      updatedAt,
      sizeBytes: 12,
      content: "{\"tables\":[]}",
    };
    assert.deepEqual(shapeShareFile(share), {
      id: share.shareId,
      updated_at: "2026-11-26T16:00:00.000Z",
      files: {
        [SHARE_FILENAME]: {
          filename: SHARE_FILENAME,
          size: 12,
          content: "{\"tables\":[]}",
        },
      },
    });
    assert.equal(SHARE_FILENAME, "share.json");
  });

  it("indexes versionId, shareId, and one share per diagram, with createdAt only on versions", () => {
    const indexes = DiagramVersion.schema.indexes();
    assert.ok(indexes.some(([fields]) => (
      fields.diagram === 1
      && fields.createdAt === -1
      && fields._id === -1
      && Object.keys(fields).length === 3
    )));
    assert.equal(DiagramVersion.schema.path("versionId").options.unique, true);
    assert.equal(DiagramShare.schema.path("shareId").options.unique, true);
    assert.equal(DiagramShare.schema.path("diagram").options.unique, true);
    assert.equal(DiagramVersion.schema.options.timestamps.createdAt, true);
    assert.equal(DiagramVersion.schema.options.timestamps.updatedAt, false);
    assert.ok(DiagramVersion.schema.path("createdAt"));
    assert.equal(DiagramVersion.schema.path("updatedAt"), undefined);
  });
});
