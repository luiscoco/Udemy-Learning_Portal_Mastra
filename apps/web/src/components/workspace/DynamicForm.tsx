import { useState } from 'react';
import { FILE_TRANSPORT_FACTOR, type InputField, type UploadedFile } from '@mlp/contracts';
import { cn } from '../../lib/cn';
import { isVisible, visibleOptions, type FieldErrors, type RawValues } from './form-model';
import { MicRecorder } from './MicRecorder';

const inputClass =
  'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-fg disabled:opacity-60 aria-[invalid=true]:border-danger';

export function DynamicForm({
  fields,
  values,
  errors,
  disabled,
  idPrefix,
  onChange,
}: {
  fields: InputField[];
  values: RawValues;
  errors: FieldErrors;
  disabled: boolean;
  idPrefix: string;
  onChange: (name: string, value: string | boolean | UploadedFile[]) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {fields.map((f) => {
        if (!isVisible(f, values)) return null; // only supported / applicable inputs are offered
        const id = `${idPrefix}-${f.name}`;
        const err = errors[f.name];
        const describedBy = [f.help ? `${id}-help` : null, err ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
        const common = {
          id,
          name: f.name,
          disabled,
          'aria-invalid': err ? true : undefined,
          'aria-describedby': describedBy,
          'aria-required': f.required && f.kind !== 'boolean' ? true : undefined,
        };
        const label = (
          <label htmlFor={id} className="text-sm font-medium text-fg">
            {f.label}
            {f.required && f.kind !== 'boolean' ? <span className="text-fg-subtle"> (required)</span> : null}
          </label>
        );
        let control;
        switch (f.kind) {
          case 'text':
            control = (
              <input
                {...common}
                type="text"
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                value={String(values[f.name] ?? '')}
                onChange={(e) => onChange(f.name, e.target.value)}
                className={cn(inputClass, 'border-border-strong')}
              />
            );
            break;
          case 'textarea':
            control = (
              <textarea
                {...common}
                rows={f.rows ?? 4}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                value={String(values[f.name] ?? '')}
                onChange={(e) => onChange(f.name, e.target.value)}
                className={cn(inputClass, 'border-border-strong')}
              />
            );
            break;
          case 'number':
            control = (
              <input
                {...common}
                type="number"
                inputMode="decimal"
                min={f.min}
                max={f.max}
                step={f.step}
                value={String(values[f.name] ?? '')}
                onChange={(e) => onChange(f.name, e.target.value)}
                className={cn(inputClass, 'border-border-strong sm:max-w-xs')}
              />
            );
            break;
          case 'select':
            control = (
              <select
                {...common}
                value={String(values[f.name] ?? '')}
                onChange={(e) => onChange(f.name, e.target.value)}
                className={cn(inputClass, 'border-border-strong sm:max-w-sm')}
              >
                {!f.required ? <option value="">—</option> : null}
                {visibleOptions(f, values).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            );
            break;
          case 'boolean':
            return (
              <div key={f.name} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    {...common}
                    type="checkbox"
                    checked={Boolean(values[f.name])}
                    onChange={(e) => onChange(f.name, e.target.checked)}
                    className="h-4 w-4 accent-[var(--mlp-accent)]"
                  />
                  {label}
                </div>
                {f.help ? (
                  <p id={`${id}-help`} className="text-xs text-fg-muted">
                    {f.help}
                  </p>
                ) : null}
              </div>
            );
          case 'file':
            control = (
              <FileField
                field={f}
                id={id}
                describedBy={describedBy}
                invalid={Boolean(err)}
                disabled={disabled}
                files={Array.isArray(values[f.name]) ? (values[f.name] as UploadedFile[]) : []}
                onChange={(files) => onChange(f.name, files)}
              />
            );
            break;
          case 'json':
            control = (
              <textarea
                {...common}
                rows={6}
                spellCheck={false}
                value={String(values[f.name] ?? '')}
                onChange={(e) => onChange(f.name, e.target.value)}
                className={cn(inputClass, 'border-border-strong font-mono text-xs')}
              />
            );
            break;
        }
        return (
          <div key={f.name} className="flex flex-col gap-1.5">
            {label}
            {control}
            {f.help ? (
              <p id={`${id}-help`} className="text-xs text-fg-muted">
                {f.help}
              </p>
            ) : null}
            {err ? (
              <p id={`${id}-error`} className="text-sm font-medium text-danger">
                {err}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const formatBytes = (n: number) =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/**
 * File picker for a `file` field. The browser only pre-screens: files too large to send at all are
 * refused here; everything else is sent and judged by the server (type sniffing, size, parsing).
 */
function FileField({
  field,
  id,
  describedBy,
  invalid,
  disabled,
  files,
  onChange,
}: {
  field: Extract<InputField, { kind: 'file' }>;
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  disabled: boolean;
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
}) {
  const [notes, setNotes] = useState<string[]>([]);
  const ceiling = Math.ceil(field.maxBytes * FILE_TRANSPORT_FACTOR);
  async function add(list: FileList | null) {
    const next = [...files];
    const skipped: string[] = [];
    for (const file of Array.from(list ?? [])) {
      if (next.length >= field.maxFiles) skipped.push(`${file.name}: at most ${field.maxFiles} file(s)`);
      else if (file.size > ceiling)
        skipped.push(`${file.name}: ${formatBytes(file.size)} is too large to send (limit ${formatBytes(field.maxBytes)})`);
      else next.push({ name: file.name, type: file.type, size: file.size, dataBase64: await readBase64(file) });
    }
    setNotes(skipped);
    onChange(next);
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        id={id}
        type="file"
        multiple={field.maxFiles > 1}
        accept={field.accept.join(',')}
        disabled={disabled || files.length >= field.maxFiles}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const input = e.currentTarget;
          void add(input.files).finally(() => (input.value = ''));
        }}
        className="text-sm text-fg file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm"
      />
      {field.record ? (
        <MicRecorder
          disabled={disabled || files.length >= field.maxFiles}
          onRecorded={(file) =>
            file.size > ceiling ? setNotes([`${file.name}: the recording is too large to send`]) : onChange([...files, file])
          }
        />
      ) : null}
      <p className="text-xs text-fg-muted">
        Allowed: {field.accept.join(', ')} · up to {formatBytes(field.maxBytes)} each · at most {field.maxFiles} file(s). The
        server checks each file’s real content.
      </p>
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label={`Selected files for ${field.label}`}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {f.name} <span className="text-fg-subtle">({formatBytes(f.size)})</span>
                {f.size > field.maxBytes ? <span className="text-danger"> over the limit: the server will reject it</span> : null}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                aria-label={`Remove ${f.name}`}
                className="rounded border border-border-strong px-2 py-0.5 text-xs"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {notes.length > 0 ? (
        <ul role="status" className="text-xs text-danger">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
