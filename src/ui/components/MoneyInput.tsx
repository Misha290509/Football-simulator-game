import { NumberInput } from './NumberInput';

interface Props {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
}

/** Numeric input that always shows thousands separators (e.g. £45,000,000). */
export function MoneyInput({ value, onChange, prefix = '£' }: Props) {
  return (
    <div className="mt-1 flex items-center bg-surface-700 border border-surface-600 rounded-md overflow-hidden">
      <span className="px-2 text-slate-500 select-none">{prefix}</span>
      <NumberInput className="bg-transparent px-1 py-2 w-full font-mono outline-none" value={value} onChange={onChange} />
    </div>
  );
}
