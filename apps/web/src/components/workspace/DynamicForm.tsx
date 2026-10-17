import type { InputField } from '@mlp/contracts';
import { cn } from '../../lib/cn';
import { isVisible, visibleOptions, type FieldErrors, type RawValues } from './form-model';

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
  onChange: (name: string, value: string | boolean) => void;
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
