import type { InputField, InputValues } from '@mlp/contracts';

/** Raw form state: strings for text-like/number/json fields, booleans for checkboxes. */
export type RawValues = Record<string, string | boolean>;

export function initialRawValues(fields: InputField[], example: InputValues): RawValues {
  const raw: RawValues = {};
  for (const f of fields) {
    const v = f.name in example ? example[f.name] : f.default;
    if (f.kind === 'boolean') raw[f.name] = Boolean(v);
    else if (f.kind === 'json') raw[f.name] = v === undefined ? '' : JSON.stringify(v, null, 2);
    else raw[f.name] = v === undefined || v === null ? '' : String(v);
  }
  return raw;
}

export type FieldErrors = Record<string, string>;

/** Converts raw form state to typed input values, mirroring each field's declared constraints. */
export function buildInput(fields: InputField[], raw: RawValues): { values: InputValues; errors: FieldErrors } {
  const values: InputValues = {};
  const errors: FieldErrors = {};
  for (const f of fields) {
    const r = raw[f.name];
    if (f.kind === 'boolean') {
      values[f.name] = Boolean(r);
      continue;
    }
    const s = typeof r === 'string' ? r : '';
    if (s.trim() === '') {
      if (f.required) errors[f.name] = 'This field is required.';
      continue;
    }
    switch (f.kind) {
      case 'text':
      case 'textarea':
        if (f.minLength !== undefined && s.trim().length < f.minLength) errors[f.name] = `Enter at least ${f.minLength} characters.`;
        else if (s.length > f.maxLength) errors[f.name] = `Use at most ${f.maxLength} characters.`;
        else values[f.name] = s;
        break;
      case 'number': {
        const n = Number(s);
        if (!Number.isFinite(n)) errors[f.name] = 'Enter a number.';
        else if (n < f.min || n > f.max) errors[f.name] = `Enter a value between ${f.min} and ${f.max}.`;
        else values[f.name] = n;
        break;
      }
      case 'select':
        if (!f.options.some((o) => o.value === s)) errors[f.name] = 'Choose one of the options.';
        else values[f.name] = s;
        break;
      case 'json': {
        if (new TextEncoder().encode(s).length > f.maxBytes) {
          errors[f.name] = `JSON is larger than ${f.maxBytes} bytes.`;
          break;
        }
        try {
          values[f.name] = JSON.parse(s) as unknown;
        } catch {
          errors[f.name] = 'This is not valid JSON.';
        }
        break;
      }
    }
  }
  return { values, errors };
}

/** Maps server validation details (`input.<field>...`) to field errors. */
export function serverDetailsToFieldErrors(details: { path: string; message: string }[] | undefined, fields: InputField[]) {
  const errors: FieldErrors = {};
  const other: string[] = [];
  for (const d of details ?? []) {
    const name = d.path.replace(/^input\.?/, '').split('.')[0] ?? '';
    if (fields.some((f) => f.name === name)) errors[name] = d.message;
    else other.push(`${d.path}: ${d.message}`);
  }
  return { errors, other };
}
