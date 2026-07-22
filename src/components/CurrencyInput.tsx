interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
}

export function CurrencyInput({ value, onChange, placeholder }: CurrencyInputProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value === 0 ? '' : String(value)}
      placeholder={placeholder ?? '0'}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, '');
        onChange(raw === '' ? 0 : Number(raw));
      }}
      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm focus:border-brand-navy focus:outline-none"
    />
  );
}
