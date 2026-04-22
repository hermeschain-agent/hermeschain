/**
 * Binary wire codec (type-tagged).
 *
 * Phase-2 / wire-binary / step-2. Minimal encoder + decoder per the
 * spec. Big-endian throughout. No schema required — the value's
 * shape is recovered from the tags.
 */

const TAG_NULL = 0x01;
const TAG_BOOL = 0x02;
const TAG_UINT64 = 0x03;
const TAG_STRING = 0x04;
const TAG_BYTES = 0x05;
const TAG_BIGINT = 0x06;
const TAG_ARRAY = 0x07;
const TAG_OBJECT = 0x08;

export function encodeBinary(value: unknown): Buffer {
  const parts: Buffer[] = [];
  writeValue(value, parts);
  return Buffer.concat(parts);
}

function writeValue(value: unknown, parts: Buffer[]): void {
  if (value === null) { parts.push(Buffer.from([TAG_NULL])); return; }
  if (typeof value === 'boolean') {
    parts.push(Buffer.from([TAG_BOOL, value ? 0x01 : 0x00]));
    return;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    const buf = Buffer.alloc(9);
    buf.writeUInt8(TAG_UINT64, 0);
    buf.writeBigUInt64BE(BigInt(value), 1);
    parts.push(buf);
    return;
  }
  if (typeof value === 'string') {
    const payload = Buffer.from(value, 'utf8');
    const header = Buffer.alloc(5);
    header.writeUInt8(TAG_STRING, 0);
    header.writeUInt32BE(payload.length, 1);
    parts.push(header, payload);
    return;
  }
  if (value instanceof Uint8Array) {
    const payload = Buffer.from(value);
    const header = Buffer.alloc(5);
    header.writeUInt8(TAG_BYTES, 0);
    header.writeUInt32BE(payload.length, 1);
    parts.push(header, payload);
    return;
  }
  if (typeof value === 'bigint') {
    const hex = value.toString(16);
    const padded = hex.length % 2 === 0 ? hex : '0' + hex;
    const payload = Buffer.from(padded, 'hex');
    const header = Buffer.alloc(5);
    header.writeUInt8(TAG_BIGINT, 0);
    header.writeUInt32BE(payload.length, 1);
    parts.push(header, payload);
    return;
  }
  if (Array.isArray(value)) {
    const header = Buffer.alloc(5);
    header.writeUInt8(TAG_ARRAY, 0);
    header.writeUInt32BE(value.length, 1);
    parts.push(header);
    for (const v of value) writeValue(v, parts);
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.keys(value as object).sort();
    const header = Buffer.alloc(5);
    header.writeUInt8(TAG_OBJECT, 0);
    header.writeUInt32BE(entries.length, 1);
    parts.push(header);
    for (const k of entries) {
      writeValue(k, parts);
      writeValue((value as { [k: string]: unknown })[k], parts);
    }
    return;
  }
  throw new Error(`binary: unsupported type ${typeof value}`);
}
