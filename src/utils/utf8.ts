import { TextDecoder } from "node:util";
import { Transform } from "node:stream";

export function createUtf8ValidatedTextStream(): Transform {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return new Transform({
    transform(chunk, _enc, cb) {
      try {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
        const text = decoder.decode(buf, { stream: true });
        cb(null, text);
      } catch (err) {
        cb(err as Error);
      }
    },
    flush(cb) {
      try {
        const tail = decoder.decode();
        if (tail) cb(null, tail);
        else cb(null);
      } catch (err) {
        cb(err as Error);
      }
    }
  });
}

