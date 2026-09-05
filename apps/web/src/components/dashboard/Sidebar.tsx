'use client';

// =============================================================================
// ForgeMind Web — Dashboard Sidebar Component
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

export interface NavItem {
  name: string;
  href: string;
  icon: string;
  enabled: boolean;
}

const navItems: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: '📊',
    enabled: true,
  },
  {
    name: 'Repositories',
    href: '/dashboard/repositories',
    icon: '📁',
    enabled: true,
  },
  {
    name: 'Analysis History',
    href: '/dashboard/history',
    icon: '⚡',
    enabled: true,
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    icon: '⚙️',
    enabled: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col min-h-screen">
      {/* Brand Header */}
      <div className="p-6 border-b border-zinc-800 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-extrabold text-zinc-950 shadow-md">
          FM
        </div>
        <div>
          <span className="font-bold text-lg text-white tracking-tight">ForgeMind</span>
          <span className="block text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
            SaaS Platform
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1.5">
        <div className="px-3 py-2 text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
          Navigation
        </div>

        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span>{item.name}</span>
              </div>

              {!item.enabled && (
                <span className="text-[10px] bg-zinc-800 text-zinc-500 border border-zinc-700/60 px-2 py-0.5 rounded-md font-semibold">
                  Soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-zinc-800">
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5 text-center">
          <p className="text-xs font-semibold text-zinc-300">ForgeMind V1</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Architecture Intelligence Platform</p>
        </div>
      </div>
    </aside>
  );
}
