import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── Theme Design Tokens ──────────────────────────────────────────────────────

export const themeTokens = {
  colors: {
    primary: {
      DEFAULT: '#2563eb', // Vibrant royal blue
      hover: '#1d4ed8',
      light: '#eff6ff',
    },
    accent: {
      DEFAULT: '#f59e0b', // Radiant amber gold
      hover: '#d97706',
      light: '#fffbeb',
    },
    success: '#10b981',
    warning: '#f97316',
    danger: '#ef4444',
    dark: '#0f172a',
  },
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
};

// ── Common UI Components ─────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-sm shadow-blue-500/20 active:scale-[0.98]',
    secondary:
      'bg-slate-100 text-slate-900 hover:bg-slate-200 focus:ring-slate-400 active:scale-[0.98]',
    accent:
      'bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 focus:ring-amber-500 shadow-sm shadow-amber-500/20 active:scale-[0.98]',
    outline:
      'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-blue-500 active:scale-[0.98]',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 active:scale-[0.98]',
  };

  const sizes: Record<ButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      ) : null}
      {children}
    </button>
  );
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  hoverEffect = false,
  ...props
}) => {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-slate-100 shadow-sm p-6',
        hoverEffect &&
          'hover:shadow-md hover:border-slate-200 transition-all duration-200',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export type BadgeVariant = 'info' | 'success' | 'warning' | 'danger' | 'amber';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'info',
  ...props
}) => {
  const variants: Record<BadgeVariant, string> = {
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-orange-50 text-orange-700 border-orange-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
};
