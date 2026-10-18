import { describe, expect, it } from 'vitest';
import { base64Length, DEFAULT_REQUEST_BYTES, InputFieldSchema, maxRequestBytes, uploadedFilesSchema, type InputField } from './lab.js';

const fileField: InputField = { kind: 'file', name: 'files', label: 'Files', accept: ['.txt'], maxBytes: 1000, maxFiles: 2, required: false };

describe('file uploads contract', () => {
  it('declares a file field with extensions, a per-file limit and a count limit', () => {
    expect(InputFieldSchema.safeParse(fileField).success).toBe(true);
    expect(InputFieldSchema.safeParse({ ...fileField, accept: ['txt'] }).success).toBe(false); // needs the dot
    expect(InputFieldSchema.safeParse({ ...fileField, maxFiles: 11 }).success).toBe(false);
  });

  it('bounds the number of files and their encoded size (with transport headroom)', () => {
    const schema = uploadedFilesSchema(fileField);
    const f = (bytes: number) => ({ name: 'a.txt', type: 'text/plain', size: bytes, dataBase64: 'A'.repeat(base64Length(bytes)) });
    expect(schema.safeParse([f(1000)]).success).toBe(true);
    expect(schema.safeParse([f(1200)]).success).toBe(true); // reaches the server, which rejects it per file
    expect(schema.safeParse([f(1300)]).success).toBe(false); // beyond the 1.25× headroom
    expect(schema.safeParse([f(1), f(1), f(1)]).success).toBe(false);
  });

  it('labs without file fields keep the default request limit', () => {
    expect(maxRequestBytes({ inputs: [] })).toBe(DEFAULT_REQUEST_BYTES);
    expect(maxRequestBytes({ inputs: [fileField] })).toBeGreaterThan(DEFAULT_REQUEST_BYTES + 2 * base64Length(1250));
  });
});
