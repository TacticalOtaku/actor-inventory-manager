import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";

import { crc32, createZip } from "../tools/zip.mjs";
import { validateManifest } from "../tools/release-manifest.mjs";

test("crc32 is the standard CRC-32 (the check value of «123456789»)", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("an archive reads back: every entry, its name, its data and the central directory count", () => {
  const files = [{ name: "module.json", data: Buffer.from('{"id":"x"}') }, { name: "scripts/main.js", data: Buffer.from("export {};\n".repeat(50)) }];
  const zip = createZip(files);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), files.length);
  let offset = 0;
  for (const { name, data } of files) {
    assert.equal(zip.readUInt32LE(offset), 0x04034b50);
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    assert.equal(zip.toString("utf8", offset + 30, offset + 30 + nameLength), name);
    const body = zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    assert.deepEqual(inflateRawSync(body), data);
    assert.equal(zip.readUInt32LE(offset + 14), crc32(data));
    offset += 30 + nameLength + size;
  }
  assert.throws(() => createZip([{ name: "../evil", data: Buffer.alloc(0) }]), /Unsafe/);
});

test("a compendium pack the build does not hold makes the manifest unreleasable", () => {
  const manifest = { id: "x", version: "1.0.0", title: "X", compatibility: { minimum: "14", verified: "14", maximum: "14" },
    url: "https://github.com/o/x", manifest: "https://raw.githubusercontent.com/o/x/main/module.json",
    download: "https://github.com/o/x/releases/download/v1.0.0/x-v1.0.0.zip",
    esmodules: ["scripts/main.js"], packs: [{ path: "packs/items" }] };
  const problems = validateManifest(manifest, { version: "1.0.0", repository: "https://github.com/o/x", exists: (file) => file !== "packs/items" });
  assert.deepEqual(problems, ["listed file is missing from the build: packs/items"]);
});
