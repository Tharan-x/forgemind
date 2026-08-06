import React from 'react';

interface AuthCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function AuthCard({ title, description, children, footer, className = '' }: AuthCardProps) {
  return (
    <div
      className={`w-full max-w-md bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl ${className}`}
    >
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent mb-2">
          {title}
        </h1>
        {description && <p className="text-zinc-400 text-sm">{description}</p>}
      </div>

      {children}

      {footer && <div className="mt-6 pt-6 border-t border-zinc-800/80 text-center">{footer}</div>}
    </div>
  );
}
