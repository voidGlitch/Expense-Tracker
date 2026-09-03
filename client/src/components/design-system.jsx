/**
 * Enhanced Design System - Modern, Versatile Components
 * Built on top of the existing Tailwind foundation with improved design tokens,
 * better accessibility, and more flexible component APIs
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { currencySymbol, parseAmount } from '../lib/money.js';

const join = (...parts) => parts.filter(Boolean).join(' ');

/* Design Tokens */
const DESIGN_TOKENS = {
  // Spacing
  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '2.5rem',
    '3xl': '3rem',
  },

  // Border Radius
  radius: {
    none: '0',
    sm: '0.125rem',
    md: '0.25rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    '3xl': '1.5rem',
    full: '9999px',
  },

  // Shadows
  shadows: {
    xs: '0 1px 2px rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px rgb(0 0 0 / 0.1), 0 1px 2px rgb(0 0 0 / 0.06)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -2px rgb(0 0 0 / 0.08)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.08)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    card: '0 1px 2px rgb(15 23 42 / 0.06), 0 8px 24px -12px rgb(15 23 42 / 0.12)',
  },

  // Transitions
  transitions: {
    fast: '150ms ease-in-out',
    normal: '200ms ease-in-out',
    slow: '300ms ease-in-out',
  },

  // Colors (extended palette)
  colors: {
    primary: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
    },
    secondary: {
      50: '#fefce8',
      100: '#fef9c3',
      200: '#fef08a',
      300: '#fde047',
      400: '#facc15',
      500: '#eab308',
      600: '#ca8a04',
      700: '#a16207',
      800: '#854d0e',
      900: '#713f12',
    },
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
    },
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
    },
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
    },
    info: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
    },
  }
};

/* Enhanced Card Component */
export function Card({
  children,
  className = '',
  variant = 'default',
  elevation = false,
  interactive = false,
  ...rest
}) {
  const baseClasses = 'rounded-2xl border transition-all duration-200';

  const variantClasses = {
    default: 'bg-white border-slate-200/80 dark:bg-slate-900 dark:border-slate-800',
    elevated: 'bg-white border-slate-200/50 shadow-lg dark:bg-slate-900 dark:border-slate-800',
    subtle: 'bg-slate-50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800',
    bordered: 'bg-white border-2 border-slate-200 dark:bg-slate-900 dark:border-slate-800',
    accent: 'bg-white border-2 border-primary-200 dark:bg-slate-900 dark:border-primary-800/20',
  };

  const interactiveClasses = interactive
    ? 'hover:border-slate-300/80 hover:dark:border-slate-700'
    : '';

  const elevationClasses = elevation ? 'shadow-card hover:shadow-lg' : '';

  return (
    <section
      className={join(baseClasses, variantClasses[variant] || variantClasses.default, interactiveClasses, elevationClasses, className)}
      {...rest}
    >
      {children}
    </section>
  );
}

/* Enhanced Card Header */
export function CardHeader({
  title,
  subtitle,
  action,
  icon: Icon,
  className = '',
  separator = true,
  ...rest
}) {
  return (
    <header
      className={join(
        'flex items-start justify-between gap-4 px-5 py-4 border-b',
        separator && 'border-slate-200',
        'dark:border-slate-800',
        className
      )}
      {...rest}
    >
      <div className="min-w-0 flex-1">
        {Icon && (
          <div className="flex-shrink-0 flex items-center">
            <Icon size={16} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
          </div>
        )}
        <div className="flex-1 min-w-0 ml-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {Icon && !document.getElementsByClassName('flex-shrink-0')[0] && (
              <Icon size={16} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            )}
            <span className="truncate">{title}</span>
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/* Enhanced Button with more variants */
const BUTTON_VARIANTS = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 dark:bg-primary-500 dark:hover:bg-primary-400',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700',
  ghost: 'text-slate-600 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:bg-slate-800/20',
  danger: 'bg-error-600 text-white hover:bg-error-700 active:bg-error-800',
  success: 'bg-success-600 text-white hover:bg-success-700 active:bg-success-800',
  warning: 'bg-warning-600 text-white hover:bg-warning-700 active:bg-warning-800',
  info: 'bg-info-600 text-white hover:bg-info-700 active:bg-info-800',
  outline: 'border border-slate-300 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
  link: 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
};

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-5 py-3 text-base rounded-xl',
  icon: 'h-10 w-10 flex items-center justify-center rounded-xl',
};

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  busy = false,
  className = '',
  type = 'button',
  disabled = false,
  block = false,
  ...rest
}) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizeStyles = BUTTON_SIZES[size] || BUTTON_SIZES.md;
  const variantStyles = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary;
  const blockStyles = block ? 'w-full' : '';

  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={join(baseStyles, sizeStyles, variantStyles, blockStyles, className)}
      {...rest}
    >
      {busy ? <Loader2 size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} className="animate-spin" /> : (
        <>
          {Icon && <Icon size={size === 'icon' ? 20 : size === 'sm' ? 14 : size === 'lg' ? 20 : 16} aria-hidden="true" />}
          {children}
        </>
      )}
    </button>
  );
}

/* Enhanced Form Components */
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required = false,
  className = '',
  ...rest
}) {
  return (
    <div className={join('space-y-2', className)}>
      {label && (
        <label
          className="label"
          htmlFor={htmlFor}
        >
          {label}
          {required && <span className="ml-0.5 text-error-500" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs font-medium text-error-600 dark:text-error-400">{error}</p>
      )}
      {!error && hint && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}

export function TextInput({
  error,
  className = '',
  size = 'md',
  ...rest
}) {
  const sizeClasses = {
    sm: 'input-sm',
    md: 'input',
    lg: 'input-lg',
  };

  return (
    <input
      className={join(
        sizeClasses[size] || 'input',
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
  size = 'md',
  children,
  ...rest
}) {
  const sizeClasses = {
    sm: 'input-sm',
    md: 'input',
    lg: 'input-lg',
  };

  return (
    <select
      className={join(
        sizeClasses[size] || 'input',
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

export function MoneyInput({
  value,
  onChange,
  currency,
  error,
  className = '',
  size = 'md',
  ...rest
}) {
  const [text, setText] = useState(value == null || value === '' ? '' : String(value));
  const emitted = useRef(value);

  useEffect(() => {
    if (value !== emitted.current) {
      setText(value == null || value === '' ? '' : String(value));
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

  const sizeClasses = {
    sm: 'input-sm pl-8',
    md: 'input pl-8',
    lg: 'input-lg pl-8',
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
          sizeClasses[size] || 'input pl-8',
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

/* Enhanced Badge System */
const BADGE_VARIANTS = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  primary: 'bg-primary-100 text-primary-800 dark:bg-primary-800/20 dark:text-primary-300',
  secondary: 'bg-secondary-100 text-secondary-800 dark:bg-secondary-800/20 dark:text-secondary-300',
  success: 'bg-success-100 text-success-800 dark:bg-success-800/20 dark:text-success-300',
  warning: 'bg-warning-100 text-warning-800 dark:bg-warning-800/20 dark:text-warning-300',
  error: 'bg-error-100 text-error-800 dark:bg-error-800/20 dark:text-error-300',
  info: 'bg-info-100 text-info-800 dark:bg-info-800/20 dark:text-info-300',
  accent: 'bg-accent-100 text-accent-800 dark:bg-accent-800/20 dark:text-accent-300',
};

const BADGE_SIZES = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  pill = false,
  ...rest
}) {
  const baseClasses = 'inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-150';
  const sizeClasses = BADGE_SIZES[size] || BADGE_SIZES.md;
  const variantClasses = BADGE_VARIANTS[variant] || BADGE_VARIANTS.neutral;
  const pillClasses = pill ? 'rounded-full' : 'rounded-md';

  return (
    <span
      className={join(baseClasses, sizeClasses, variantClasses, pillClasses, className)}
      {...rest}
    >
      {children}
    </span>
  );
}

/* Enhanced Progress Bar */
export function ProgressBar({
  value,
  max = 100,
  variant = 'primary',
  label,
  className = '',
  striped = false,
  animated = false,
  ...rest
}) {
  const ratio = max > 0 ? Math.min(Math.max(Number(value) / Number(max), 0), 1) : 0;

  const VARIANT_COLORS = {
    primary: 'bg-primary-600',
    secondary: 'bg-slate-600',
    success: 'bg-success-600',
    warning: 'bg-warning-600',
    error: 'bg-error-600',
    info: 'bg-info-600',
  };

  const barClasses = VARIANT_COLORS[variant] || VARIANT_COLORS.primary;
  const stripeClasses = striped ? 'bg-gradient-to-r from-[var(--bg-start)] to-[var(--bg-end)] via-[var(--bg-middle)]' : '';
  const animationClasses = animated ? 'animate-[progress-bar-stripes_2s_linear_infinite]' : '';

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
      {...rest}
    >
      <div
        className={join(
          'h-full rounded-full transition-[width] duration-500',
          barClasses,
          stripeClasses,
          animationClasses
        )}
        style={{
          width: `${ratio * 100}%`,
          '--bg-start': 'rgba(255,255,255,0.15)',
          '--bg-end': 'rgba(255,255,255,0)',
          '--bg-middle': 'rgba(255,255,255,0.1)'
        }}
      />
    </div>
  );
}

/* Enhanced Stat Component */
export function Stat({
  label,
  value,
  hint,
  variant = 'neutral',
  icon: Icon,
  className = '',
  trend,
  ...rest
}) {
  const VARIANT_COLORS = {
    neutral: 'text-slate-900 dark:text-slate-100',
    primary: 'text-primary-600 dark:text-primary-400',
    secondary: 'text-slate-600 dark:text-slate-400',
    success: 'text-success-600 dark:text-success-400',
    warning: 'text-warning-600 dark:text-warning-400',
    error: 'text-error-600 dark:text-error-400',
    info: 'text-info-600 dark:text-info-400',
  };

  const TREND_INDICATORS = {
    up: 'text-success-600',
    down: 'text-error-600',
    neutral: 'text-slate-500',
  };

  return (
    <div className={join('rounded-xl bg-white border border-slate-200/80 p-4 sm:p-5 dark:bg-slate-900 dark:border-slate-800', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          {Icon && <Icon size={15} className="ms-2 text-slate-400" aria-hidden="true" />}
        </div>
        <div className="flex items-baseline gap-2">
          <p className={join('mt-1 text-3xl font-semibold tnum', VARIANT_COLORS[variant] || VARIANT_COLORS.neutral)}>{value}</p>
          {trend && (
            <span className={join('ml-1 text-xs font-medium', TREND_INDICATORS[trend] || TREND_INDICATORS.neutral)}>
              {trend === 'up' && '▲'}
              {trend === 'down' && '▼'}
              {trend === 'neutral' && '●'}
            </span>
          )}
        </div>
      </div>
      {hint && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}

/* Enhanced Banner/Alert */
const BANNER_VARIANTS = {
  info: 'border-info-200 bg-info-50 text-info-900 dark:border-info-500/30 dark:bg-info-500/10 dark:text-info-200',
  warn: 'border-warning-200 bg-warning-50 text-warning-900 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-200',
  error: 'border-error-200 bg-error-50 text-error-900 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-200',
  success: 'border-success-200 bg-success-50 text-success-900 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200',
};

export function Banner({
  variant = 'info',
  title,
  children,
  actions,
  icon: Icon,
  className = '',
  dismissible = false,
  onDismiss,
  ...rest
}) {
  const bannerClasses = BANNER_VARIANTS[variant] || BANNER_VARIANTS.info;

  return (
    <div
      className={join(
        'flex flex-wrap items-start gap-4 rounded-xl border p-5 text-sm',
        bannerClasses,
        className
      )}
      {...rest}
    >
      {Icon && (
        <div className="flex-shrink-0 mt-0.5">
          <Icon size={20} className="text-current" aria-hidden="true" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-3 mt-2">
          {actions}
        </div>
      )}
      {dismissible && (
        <button
          type="button"
          className="ml-auto flex-shrink-0 -mr-2 -mt-2 h-6 w-6 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <span className="sr-only">Close</span>
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}

/* Enhanced Empty State */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className = '',
  image,
  ...rest
}) {
  return (
    <div className={join('flex flex-col items-center justify-center gap-4 px-6 py-12 text-center', className)}>
      {image && (
        <div className="w-full max-w-xs">
          <img
            src={image}
            alt={title}
            className="rounded-xl shadow-lg"
          />
        </div>
      )}
      {!image && Icon && (
        <div className="flex items-center justify-center size-12 rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300 mb-4">
          <Icon size={24} aria-hidden="true" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {children && (
        <p className="mt-2 max-w-xl text-xs text-slate-500 dark:text-slate-400">{children}</p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  );
}

/* Enhanced Toggle Switch */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  className = '',
  ...rest
}) {
  const id = useId();

  return (
    <div className={join('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="text-sm font-medium text-slate-800 dark:text-slate-200"
        >
          {label}
        </label>
        {hint && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        )}
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
          'relative h-6 w-11 shrink-0 rounded-full transition-all duration-200 disabled:opacity-50',
          checked ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-700'
        )}
      >
        <span
          className={join(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200',
            checked ? 'left-[1.375rem]' : 'left-0.5'
          )}
        />
      </button>
    </div>
  );
}

/* Enhanced Segmented Control */
export function Segmented({
  options,
  value,
  onChange,
  cols,
  label,
  className = '',
  variant = 'default',
  ...rest
}) {
  const VARIANT_STYLES = {
    default: 'bg-slate-50 dark:bg-slate-900/50',
    elevated: 'bg-white dark:bg-slate-900/30 shadow-sm',
    outline: 'border border-slate-200 dark:border-slate-800',
  };

  const variantClass = VARIANT_STYLES[variant] || VARIANT_STYLES.default;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={join(
        'grid gap-1 rounded-xl p-1',
        variantClass,
        cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4',
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
              'flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
              selected
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/20',
            )}
          >
            <span className="block text-sm font-medium">{option.label}</span>
            {option.hint && (
              <span className="mt-0.5 block text-[11px] leading-tight opacity-70">{option.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* Responsive Grid Helper */
export function ResponsiveGrid({
  children,
  cols = { base: 1, sm: 2, lg: 3, xl: 4 },
  gap = 4,
  className = '',
  ...rest
}) {
  const colClasses = `grid-cols-${cols.base} sm:grid-cols-${cols.sm} lg:grid-cols-${cols.lg} xl:grid-cols-${cols.xl}`;

  return (
    <div
      className={join(
        `grid gap-${gap}`,
        colClasses,
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}