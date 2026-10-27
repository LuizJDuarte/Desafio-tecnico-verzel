import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link, type LinkProps } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'win';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-ink hover:brightness-95 active:brightness-90 disabled:opacity-60 shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]',
  secondary: 'border border-line-strong bg-raised text-ink hover:border-ink-faint disabled:opacity-60',
  ghost: 'text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-50',
  danger: 'border border-lose/60 bg-raised text-lose hover:bg-lose-soft disabled:opacity-60',
  win: 'bg-win text-white hover:brightness-110 disabled:opacity-60',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-[15px] gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex items-center justify-center rounded-lg font-semibold font-semiwide whitespace-nowrap transition-[filter,background-color,border-color] duration-150',
    variants[variant],
    sizes[size],
    className,
  );

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border bg-raised px-3 text-[15px] text-ink placeholder:text-ink-faint',
          'focus:border-focus focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0',
          invalid ? 'border-lose' : 'border-line-strong',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-lose" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-faint" role="status">
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </span>
  );
}

/**
 * Carregamento com aviso de "servidor acordando": no plano gratuito do Render a API hiberna após
 * 15 minutos sem uso e o primeiro acesso pode levar até um minuto.
 */
export function PageLoading({ label = 'Carregando' }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <Spinner label={label} />
      {slow && (
        <p className="max-w-sm text-sm text-ink-faint">
          O servidor gratuito hiberna quando fica sem uso. O primeiro acesso pode levar até um minuto; depois fica
          rápido.
        </p>
      )}
    </div>
  );
}

export function ErrorState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mt-2 text-ink-soft">{message}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="font-serif text-xl">{title}</p>
      {children && <div className="mt-2 text-ink-soft">{children}</div>}
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-xl border border-line bg-surface', className)}>{children}</section>;
}
