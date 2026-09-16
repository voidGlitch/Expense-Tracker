/**
 * Small building blocks shared by every view.
 *
 * They are deliberately plain: styling lives in the component classes defined in
 * index.css, so a change to the look of a button happens in one place.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { currencySymbol, parseAmount } from '../lib/money.js';

const join = (...parts) => parts.filter(Boolean).join(' ');

export function Card({ children, className = '', ...rest }) {
  return (
    <section className={join('card', className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {Icon ? (
            <Icon
              size={16}
              className="shrink-0 text-slate-400"
              aria-hidden="true"
            />
          ) : null}

          <span className="truncate">{title}</span>
        </h2>

        {subtitle ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        ) : null}
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function Spinner({ size = 16, className = '' }) {
  return (
    <Loader2
      size={size}
      className={join('animate-spin', className)}
      aria-hidden="true"
    />
  );
}

const VARIANTS = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400',

  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700',

  ghost:
    'text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800',

  danger:
    'bg-rose-600 text-white hover:bg-rose-500',
};

export function Button({
  children,
  variant = 'secondary',
  size,
  icon: Icon,
  busy = false,
  className = '',
  type = 'button',
  disabled,
  ...rest
}) {
  // A page can deliberately supply its own colour pair (for example a white
  // action on a dark hero). Do not let the default variant's `bg-white` win
  // later in Tailwind's generated stylesheet and hide its white label.
  const hasCustomSurface = /(?:^|\s)!?bg-[^\s]+/.test(className);
  const hasCustomText = /(?:^|\s)!?text-[^\s]+/.test(className);
  const variantStyles = hasCustomSurface || hasCustomText ? '' : VARIANTS[variant];
  const baseStyles =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const smStyles =
    size === 'sm' ? 'px-3 py-1.5 text-xs rounded-lg' : '';

  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={join(
        baseStyles,
        variantStyles,
        smStyles,
        className
      )}
      {...rest}
    >
      {busy ? (
        <Spinner />
      ) : Icon ? (
        <Icon
          size={size === 'sm' ? 14 : 16}
          aria-hidden="true"
        />
      ) : null}

      {children}
    </button>
  );
}

/** Label + optional hint + inline error, wired to the control with a generated id. */
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required = false,
}) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}

          {required ? (
            <span
              className="ml-0.5 text-rose-500"
              aria-hidden="true"
            >
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {children}

      {error ? (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ error, className = '', ...rest }) {
  return (
    <input
      className={join(
        'input',
        error && 'input-error',
        className
      )}
      {...rest}
    />
  );
}

export function Select({
  error,
  className = '',
  children,
  ...rest
}) {
  return (
    <select
      className={join(
        'input',
        'pr-8',
        error && 'input-error',
        className
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/**
 * Amount box. Keeps what was typed as text so half-finished input like "12." is
 * not fought with, and reports a parsed number (or null) upward on every change.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  error,
  className = '',
  ...rest
}) {
  const [text, setText] = useState(
    value == null || value === '' ? '' : String(value)
  );

  const emitted = useRef(value);

  useEffect(() => {
    if (value !== emitted.current) {
      setText(
        value == null || value === '' ? '' : String(value)
      );

      emitted.current = value;
    }
  }, [value]);

  const handleChange = (event) => {
    const next = event.target.value;

    setText(next);

    const parsed = parseAmount(next);

    emitted.current = parsed;

    onChange(parsed);
  };

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
        aria-hidden="true"
      >
        {currencySymbol(currency)}
      </span>

      <input
        className={join(
          'input',
          'pl-8',
          'tnum',
          error && 'input-error',
          className
        )}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={handleChange}
        {...rest}
      />
    </div>
  );
}

const BADGE_VARIANTS = {
  neutral:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',

  success:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',

  warning:
    'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',

  error:
    'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',

  info:
    'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',

  accent:
    'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',

  secondary:
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',

  primary:
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
};

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) {
  const sizeClass = size === 'sm' ? 'chip-sm' : '';

  return (
    <span
      className={join(
        'chip',
        BADGE_VARIANTS[variant] || BADGE_VARIANTS.neutral,
        sizeClass,
        className
      )}
    >
      {children}
    </span>
  );
}

const BARS = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  blue: 'bg-sky-500',
  slate: 'bg-slate-400 dark:bg-slate-500',
};

export function ProgressBar({
  value,
  max = 100,
  tone = 'blue',
  label,
  className = '',
}) {
  const ratio =
    max > 0
      ? Math.min(
          Math.max(Number(value) / Number(max), 0),
          1
        )
      : 0;

  return (
    <div
      className={join(
        'h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800',
        className
      )}
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={join(
          'h-full rounded-full transition-[width] duration-500',
          BARS[tone] || BARS.blue
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

const STAT_TONES = {
  neutral: 'text-slate-900 dark:text-slate-100',
  green: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-rose-600 dark:text-rose-400',
  blue: 'text-sky-600 dark:text-sky-400',
};

/** One number with its caption — the dashboard is built out of these. */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  className = '',
}) {
  return (
    <div className={join('card card-pad', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>

        {Icon ? (
          <Icon
            size={15}
            className="text-slate-400"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <p
        className={join(
          'mt-1.5 text-xl font-semibold tnum',
          STAT_TONES[tone] || STAT_TONES.neutral
        )}
      >
        {value}
      </p>

      {hint ? (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Tabs component for switching between views */
export function Tabs({
  activeTab,
  onChange,
  tabs = [],
  className = '',
}) {
  return (
    <div
      className={join(
        'flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg',
        className
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={join(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all',
              isActive
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            {Icon && (
              <Icon
                size={16}
                aria-hidden="true"
              />
            )}

            <span className="hidden sm:inline">
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const BANNERS = {
  info:
    'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',

  warn:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',

  error:
    'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',

  success:
    'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
};

export function Banner({
  variant = 'info',
  title,
  children,
  actions,
  icon: Icon,
  className = '',
}) {
  return (
    <div
      className={join(
        'flex flex-wrap items-start gap-3 rounded-card border px-4 py-3 text-sm',
        BANNERS[variant] || BANNERS.info,
        className
      )}
    >
      {Icon ? (
        <Icon
          size={18}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
      ) : null}

      <div className="min-w-[12rem] flex-1">
        {title ? (
          <p className="font-semibold">{title}</p>
        ) : null}

        {children ? (
          <div className={title ? 'mt-0.5' : ''}>
            {children}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className = '',
}) {
  return (
    <div
      className={join(
        'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className
      )}
    >
      {Icon ? (
        <span className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
          <Icon
            size={18}
            aria-hidden="true"
          />
        </span>
      ) : null}

      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
        {title}
      </p>

      {children ? (
        <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
          {children}
        </p>
      ) : null}

      {action ? (
        <div className="mt-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}

const COLS = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

/**
 * Radio group that looks like a set of tabs — used for the three bill axes, where
 * seeing all the choices at once matters more than saving space.
 */
export function Segmented({
  options,
  value,
  onChange,
  cols,
  label,
  className = '',
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={join(
        'grid gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/70',
        COLS[cols || options.length] || COLS[2],
        className
      )}
    >
      {options.map((option) => {
        const selected = value === option.id;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={join(
              'rounded-md px-2.5 py-1.5 text-left transition-colors',
              selected
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            <span className="block text-sm font-medium">
              {option.label}
            </span>

            {option.hint ? (
              <span className="mt-0.5 block text-[11px] leading-tight opacity-70">
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled on/off switch. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}) {
  const id = useId();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          {label}
        </label>

        {hint ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        ) : null}
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={join(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
          checked
            ? 'bg-sky-600'
            : 'bg-slate-300 dark:bg-slate-700'
        )}
      >
        <span
          className={join(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]',
            checked ? 'left-[1.375rem]' : 'left-0.5'
          )}
        />
      </button>
    </div>
  );
}

/**
 * Avatar component for profile images
 */
export function Avatar({
  src,
  alt,
  size = 'md',
  initials,
  className = '',
}) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-xl',
  };

  if (src) {
    return (
      <img
        src={src}
        alt={alt || 'Avatar'}
        className={join(
          'rounded-full object-cover',
          sizeClasses[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={join(
        'flex items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 font-semibold text-white',
        sizeClasses[size],
        className
      )}
    >
      {initials || '?'}
    </div>
  );
}
