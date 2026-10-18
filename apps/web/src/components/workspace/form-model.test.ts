import { describe, expect, it } from 'vitest';
import type { InputField } from '@mlp/contracts';
import { buildInput, initialRawValues } from './form-model';

const fields: InputField[] = [
  { kind: 'file', name: 'files', label: 'Files', accept: ['.txt'], maxBytes: 100, maxFiles: 2, required: false },
  { kind: 'boolean', name: 'store', label: 'Store', default: true, required: true },
];
const f = { name: 'a.txt', type: 'text/plain', size: 3, dataBase64: 'YWJj' };

describe('form model: file fields', () => {
  it('starts empty (browsers cannot preselect files) and omits an empty optional file field', () => {
    const raw = initialRawValues(fields, { files: [f], store: true });
    expect(raw.files).toEqual([]);
    expect(buildInput(fields, raw).values).toEqual({ store: true });
  });

  it('submits the selected files and enforces the count limit', () => {
    expect(buildInput(fields, { files: [f], store: true }).values.files).toEqual([f]);
    expect(buildInput(fields, { files: [f, f, f], store: true }).errors.files).toBe('Choose at most 2 file(s).');
  });

  it('leaves size judgement to the server (an over-limit file is still sent)', () => {
    const big = { ...f, size: 500 };
    expect(buildInput(fields, { files: [big], store: true }).values.files).toEqual([big]);
  });
});
