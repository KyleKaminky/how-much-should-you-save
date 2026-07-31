import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';

/**
 * Lets a numeric input hold what you are typing.
 *
 * These fields are controlled by a *clamped* value, which fights the typist two
 * ways: clearing the box yields NaN, and the first digit of "45" commits 4,
 * which the age clamp rewrites to 16 before you can type the 5. So while the
 * field has focus it renders your raw keystrokes, committing only when they
 * parse. On blur the draft is dropped and the clamped value takes over again.
 */
function useNumericDraft(
  value: number,
  commit: (n: number) => void,
  toDisplay: (v: number) => number = (v) => v,
  fromDisplay: (v: number) => number = (v) => v,
) {
  const [draft, setDraft] = useState<string | null>(null);

  const settled = Number.isFinite(value) ? String(Number(toDisplay(value).toFixed(4))) : '';

  return {
    value: draft ?? settled,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setDraft(e.target.value);
      const next = e.target.valueAsNumber;
      if (!Number.isNaN(next)) commit(fromDisplay(next));
    },
    onBlur: () => setDraft(null),
  };
}

/**
 * Label + optional hint above a control. `htmlFor` ties the label to its input —
 * without it the label is just text sitting near a box, unreachable to screen
 * readers and unclickable.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        <span>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  const id = useId();
  const draft = useNumericDraft(value, onChange);
  const input = <input id={id} type="number" min={min} max={max} step={step} {...draft} />;

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      {prefix ? (
        <div className="input-prefix">
          <span aria-hidden="true">{prefix}</span>
          {input}
        </div>
      ) : suffix ? (
        <div className="input-suffix">
          <span aria-hidden="true">{suffix}</span>
          {input}
        </div>
      ) : (
        input
      )}
    </Field>
  );
}


/**
 * A dollar field that groups thousands as you type.
 *
 * `<input type="number">` cannot show separators — browsers reject any
 * non-numeric character — so this is a text input that formats on every
 * keystroke. Worth the extra machinery: the whole point of these fields is
 * large round numbers, and an unseparated string of zeros is exactly where a
 * factor-of-ten typo hides.
 *
 * Reformatting mid-string would normally throw the caret to the end, so the
 * caret is restored by counting digits rather than characters — insert a comma
 * to the left of the cursor and the cursor still sits after the same digit.
 */
export function CurrencyField({
  label,
  hint,
  value,
  onChange,
  max = 1e12,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const settled = Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '';
  const display = draft ?? settled;

  useLayoutEffect(() => {
    const el = ref.current;
    const digitsBefore = caretRef.current;
    if (!el || digitsBefore === null) return;
    caretRef.current = null;

    // Walk the formatted string until we have passed the same number of digits.
    let pos = 0;
    let seen = 0;
    while (pos < el.value.length && seen < digitsBefore) {
      if (/\d/.test(el.value[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }, [display]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    caretRef.current = raw.slice(0, caret).replace(/\D/g, '').length;

    const digits = raw.replace(/\D/g, '');
    if (digits === '') {
      setDraft('');
      onChange(0);
      return;
    }

    const next = Math.min(Number(digits), max);
    setDraft(next.toLocaleString('en-US'));
    onChange(next);
  };

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="input-prefix">
        <span aria-hidden="true">$</span>
        <input
          id={id}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={display}
          onChange={handleChange}
          onBlur={() => setDraft(null)}
        />
      </div>
    </Field>
  );
}

/** Percentage field that stores a fraction but shows whole percent. */
export function PercentField({
  label,
  hint,
  value,
  onChange,
  step = 0.1,
  min = 0,
  max = 100,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  onChange: (fraction: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const draft = useNumericDraft(
    value,
    onChange,
    (v) => v * 100,
    (v) => v / 100,
  );

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="input-suffix">
        <span aria-hidden="true">%</span>
        <input id={id} type="number" step={step} min={min} max={max} {...draft} />
      </div>
    </Field>
  );
}

/** A bare numeric input with the same draft behaviour, for one-off overrides. */
export function DraftInput({
  value,
  onChange,
  toDisplay,
  fromDisplay,
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
  toDisplay?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  id?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const draft = useNumericDraft(value, onChange, toDisplay, fromDisplay);
  return <input type="number" {...rest} {...draft} />;
}

export function Segmented<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; title?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
