import {sha256} from '@noble/hashes/sha256';
import {Buffer} from 'buffer';
export function randomBytes(length) { return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(length))); }
export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw new Error('Unsupported hash');
  let value='';
  return {update(input) {value+=input;return this;},digest(format) {
    const bytes=sha256(new TextEncoder().encode(value));
    return format==='hex'?Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''):bytes;
  }};
}
export default {randomBytes,createHash};
