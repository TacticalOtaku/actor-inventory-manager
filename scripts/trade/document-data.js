/** Compare serialized document data by value, not object property insertion order. */
export function canonicalJSON(value) {
  return JSON.stringify(value, (key, current) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return current;
    return Object.fromEntries(Object.keys(current).sort().map(name => [name, current[name]]));
  });
}

const fraction32 = (x) => ((x - Math.floor(x)) * 2 ** 32) >>> 0;
const PRIMES = [];
for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every((p) => n % p)) PRIMES.push(n);
// FIPS 180-4: the round constants and the first hash words come from the primes' cube and square roots.
const K = PRIMES.map((p) => fraction32(Math.cbrt(p)));
const H0 = PRIMES.slice(0, 8).map((p) => fraction32(Math.sqrt(p)));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/**
 * SHA-256 of a string's UTF-8 bytes, as hex. Plain JS because `crypto.subtle` exists only on https and localhost,
 * and a GM may host over plain http on the local network.
 * @param {string} text
 * @returns {string}
 */
export function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const words = new Uint32Array(((bytes.length + 9 + 63) >> 6) << 4);
  bytes.forEach((byte, i) => { words[i >> 2] |= byte << (24 - (i % 4) * 8); });
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[words.length - 2] = Math.floor(bytes.length / 2 ** 29);
  words[words.length - 1] = bytes.length * 8;
  const hash = [...H0];
  const w = new Uint32Array(64);
  for (let block = 0; block < words.length; block += 16) {
    for (let t = 0; t < 64; t++) {
      if (t < 16) { w[t] = words[block + t]; continue; }
      const a = w[t - 15], b = w[t - 2];
      w[t] = w[t - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[t - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0];
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => { hash[i] = (hash[i] + value) | 0; });
  }
  return hash.map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
}

export function documentFingerprint(data) {
  const { _stats, sort, ...assets } = data;
  return canonicalJSON(assets);
}

/** Older recovery journals may contain expanded dot-notation attribute paths. */
export function recoveryAttributes(attributes, prefix = "") {
  return Object.fromEntries(Object.entries(attributes).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(recoveryAttributes(value, path)) : [[path, value]];
  }));
}
