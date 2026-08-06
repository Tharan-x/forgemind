import type { Metadata } from 'next';

import { APP_NAME, APP_VERSION } from '@forgemind/shared';
import { Button } from '@forgemind/ui';

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: `${APP_NAME} — Sprint 0`,
  description:
    'AI-Powered GitHub Repository Intelligence & Developer Onboarding SaaS Platform. Sprint 0: Monorepo infrastructure foundation.',
};

// ─── Sprint 0 Status Items ────────────────────────────────────────────────────

const statusItems = [
  { label: 'Next.js 15 + React 19', status: 'ready' },
  { label: 'TypeScript (strict mode)', status: 'ready' },
  { label: 'TailwindCSS v4', status: 'ready' },
  { label: 'Turborepo pipeline', status: 'ready' },
  { label: 'pnpm workspaces', status: 'ready' },
  { label: '@forgemind/ui', status: 'ready' },
  { label: '@forgemind/shared', status: 'ready' },
  { label: '@forgemind/types', status: 'ready' },
  { label: 'Express API (port 4000)', status: 'ready' },
  { label: 'Prisma ORM', status: 'ready' },
  { label: 'Docker + Compose', status: 'ready' },
  { label: 'ESLint + Prettier', status: 'ready' },
  { label: 'Husky + lint-staged', status: 'ready' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-1.5 text-sm text-zinc-400 mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Sprint 0 — Infrastructure Ready
        </div>

        <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent mb-4">
          {APP_NAME}
        </h1>

        <p className="text-zinc-400 text-lg max-w-xl">
          AI-Powered GitHub Repository Intelligence &amp; Developer Onboarding Platform
        </p>

        <p className="text-zinc-600 text-sm mt-2">v{APP_VERSION}</p>
      </div>

      {/* Status Grid */}
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8">
        <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-4">
          Monorepo Stack — All Systems Operational
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {statusItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-4 py-2.5"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-sm text-zinc-300">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Buttons — uses @forgemind/ui Button component */}
      <div className="flex gap-3 flex-wrap justify-center">
        <Button variant="default" className="bg-white text-zinc-950 hover:bg-zinc-200" asChild>
          <a href="http://localhost:4000/api/v1/health" target="_blank" rel="noreferrer">
            API Health Check →
          </a>
        </Button>
        <Button
          variant="outline"
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          asChild
        >
          <a href="https://github.com/your-org/forgemind" target="_blank" rel="noreferrer">
            View Repository
          </a>
        </Button>
      </div>

      {/* Footer */}
      <p className="text-zinc-700 text-xs mt-12">
        Sprint 0 complete. Authentication, Dashboard, and AI Chat coming in future sprints.
      </p>
    </main>
  );
}
