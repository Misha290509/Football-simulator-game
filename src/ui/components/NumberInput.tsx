import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';

type Native = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

interface Props extends Native {
  value: number;
  onChange: (v: number) => void;
  /**
   * Show an empty box instead of 0, so a filter with nothing in it reads as
   * blank and shows its placeholder.
   */
  blankZero?: boolean;
}

const format = (n: number) => n.toLocaleString('en-US');
const digitsBefore = (s: string, pos: number) => s.slice(0, pos).replace(/[^0-9]/g, '').length;

/**
 * A whole-number input that always shows a comma every three digits, so
 * 3,000,000 and 30,000,000 can't be mistaken for each other.
 *
 * Reformatting on every keystroke would throw the cursor to the end, so the
 * cursor is put back after the same number of digits it was behind.
 */
export function NumberInput({ value, onChange, blankZero, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caretDigits = useRef<number | null>(null);
  const shown = blankZero && value === 0 ? '' : format(value);

  useLayoutEffect(() => {
    const el = ref.current;
    const want = caretDigits.current;
    if (!el || want === null || document.activeElement !== el) return;
    caretDigits.current = null;
    let pos = 0;
    let seen = 0;
    while (pos < shown.length && seen < want) {
      if (/[0-9]/.test(shown[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }, [shown]);

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        caretDigits.current = digitsBefore(raw, e.target.selectionStart ?? raw.length);
        const digits = raw.replace(/[^0-9]/g, '');
        const n = digits === '' ? 0 : Number(digits);
        onChange(Number.isSafeInteger(n) ? n : value);
      }}
    />
  );
}
