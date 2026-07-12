import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  secondary?: boolean;
};

export function Button({ children, secondary, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        secondary
          ? 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50'
          : 'bg-emerald-700 text-white hover:bg-emerald-800'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
