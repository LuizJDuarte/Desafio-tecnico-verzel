import { forwardRef, type InputHTMLAttributes } from 'react';
import { centsToInputValue, parseBRLToCents } from '@arremate/shared';
import { cn } from '../lib/cn';

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  value: string;
  onValueChange(text: string, cents: number | null): void;
  invalid?: boolean;
  size?: 'md' | 'lg';
}

/** Campo de valor em reais. Aceita "1.234,56", "1234,56" ou "1234"; ao sair do campo, formata. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, invalid, size = 'md', className, onBlur, ...props },
  ref,
) {
  return (
    <div
      className={cn(
        'flex items-center rounded-lg border bg-raised focus-within:border-focus',
        invalid ? 'border-lose' : 'border-line-strong',
        size === 'lg' ? 'h-12' : 'h-11',
        className,
      )}
    >
      <span className="pl-3 pr-1 font-semibold text-ink-faint" aria-hidden>
        R$
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          'h-full w-full min-w-0 rounded-r-lg bg-transparent pr-3 font-semiwide font-semibold tabular text-ink outline-none',
          size === 'lg' ? 'text-lg' : 'text-[15px]',
        )}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onValueChange(event.target.value, parseBRLToCents(event.target.value))}
        onBlur={(event) => {
          const cents = parseBRLToCents(value);
          if (cents !== null) onValueChange(centsToInputValue(cents), cents);
          onBlur?.(event);
        }}
        {...props}
      />
    </div>
  );
});
