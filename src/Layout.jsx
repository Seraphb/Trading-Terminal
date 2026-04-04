import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Activity, BarChart3, Brain, Briefcase, Eye, Flame, GitCompare, LayoutGrid, Moon, Newspaper, Scan, SlidersHorizontal, Sparkles, Sun, Zap } from 'lucide-react';
import { ThemeProvider, useTheme } from './components/ThemeContext';
import UserProfileMenu from '@/components/profile/UserProfileMenu';

function ThemeToggleBtn() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition-all hover:translate-y-[-1px]"
      style={{
        background: theme === 'light' ? 'rgba(255,255,255,0.90)' : 'rgba(20,30,55,0.68)',
        border: `1px solid ${theme === 'light' ? 'rgba(148,163,184,0.32)' : 'rgba(148,163,184,0.12)'}`,
        color: theme === 'light' ? 'hsl(222,47%,27%)' : 'rgb(203 213 225)',
        boxShadow: theme === 'light'
          ? '0 2px 8px rgba(100,116,139,0.12)'
          : '0 10px 30px rgba(2,6,23,0.18)',
      }}
    >
      {theme === 'dark'
        ? <Sun className="h-3.5 w-3.5" style={{ color: '#facc15' }} />
        : <Moon className="h-3.5 w-3.5" style={{ color: '#60a5fa' }} />}
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}

function NavBar() {
  const { theme } = useTheme();
  const location = useLocation();

  const navStyle = {
    background: theme === 'light'
      ? 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(241,245,249,0.86))'
      : 'linear-gradient(180deg, rgba(16,24,46,0.88), rgba(20,30,55,0.82))',
    borderBottom: `1px solid ${theme === 'light' ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.08)'}`,
    backdropFilter: 'blur(18px)',
  };

  const isActive = (page) => location.pathname === `/${page}` || (location.pathname === '/' && page === 'Terminal');

  return (
    <nav className="relative z-10 flex h-16 items-center gap-3 px-4 flex-shrink-0" style={navStyle}>
      <div className="hidden items-center gap-3 lg:flex">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-cyan-300 text-slate-950 shadow-lg shadow-blue-500/20">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">Market Desk</div>
          <div className={`text-sm font-semibold ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}>Pro</div>
        </div>
      </div>

      <div
        className="flex items-center overflow-hidden rounded-2xl"
        style={{
          border: `1px solid ${theme === 'light' ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.12)'}`,
          background: theme === 'light' ? 'rgba(255,255,255,0.82)' : 'rgba(20,30,55,0.5)',
          boxShadow: theme === 'light'
            ? '0 2px 12px rgba(100,116,139,0.10)'
            : '0 10px 25px rgba(2,6,23,0.18)',
        }}
      >
        <Link
          to={createPageUrl('Terminal')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${
            isActive('Terminal')
              ? 'bg-blue-500/20 text-blue-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Crypto
        </Link>
        <div
          style={{
            width: '1px',
            height: '18px',
            background: theme === 'light' ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.12)',
          }}
        />
        <Link
          to={createPageUrl('Stocks')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${
            isActive('Stocks')
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Stocks
        </Link>
      </div>

      <div
        className="flex items-center overflow-hidden rounded-2xl"
        style={{
          border: `1px solid ${theme === 'light' ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.12)'}`,
          background: theme === 'light' ? 'rgba(255,255,255,0.82)' : 'rgba(20,30,55,0.5)',
          boxShadow: theme === 'light' ? '0 2px 12px rgba(100,116,139,0.10)' : '0 10px 25px rgba(2,6,23,0.18)',
        }}
      >
        <Link
          to={createPageUrl('Scanner')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${
            isActive('Scanner')
              ? 'bg-orange-500/20 text-orange-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Scanner
        </Link>
        <div style={{ width: '1px', height: '18px', background: theme === 'light' ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.12)' }} />
        <Link
          to={createPageUrl('Screener')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${
            isActive('Screener')
              ? 'bg-indigo-500/20 text-indigo-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Scan className="h-3.5 w-3.5" />
          Screener
        </Link>
      </div>

      <Link
        to={createPageUrl('Signals')}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ring-1 ${
          isActive('Signals')
            ? 'bg-purple-500/15 text-purple-300 ring-purple-500/40'
            : 'ring-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Brain className="h-3.5 w-3.5" />
        Signals
      </Link>

      <Link
        to={createPageUrl('PumpSignals')}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ring-1 ${
          isActive('PumpSignals')
            ? 'bg-amber-500/15 text-amber-300 ring-amber-500/40'
            : 'ring-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Zap className="h-3.5 w-3.5" />
        Pump Scan
      </Link>


      <Link
        to={createPageUrl('Memes')}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ring-1 ${
          isActive('Memes')
            ? 'bg-yellow-500/15 text-yellow-300 ring-yellow-500/40'
            : 'ring-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Flame className="h-3.5 w-3.5" />
        Memes
      </Link>

      <Link
        to={createPageUrl('Heatmap')}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ring-1 ${
          isActive('Heatmap')
            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
            : 'ring-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Heatmap
      </Link>

      <Link
        to={createPageUrl('Portfolio')}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ring-1 ${
          isActive('Portfolio')
            ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40'
            : 'ring-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Briefcase className="h-3.5 w-3.5" />
        Portfolio
      </Link>

      <Link
        to={createPageUrl('Insiders')}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ring-1 ${
          isActive('Insiders')
            ? 'bg-red-500/15 text-red-300 ring-red-500/40'
            : 'ring-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Eye className="h-3.5 w-3.5" />
        Insiders
      </Link>

      <Link
        to={createPageUrl('Compare')}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ring-1 ${
          isActive('Compare')
            ? 'bg-teal-500/15 text-teal-300 ring-teal-500/40'
            : 'ring-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <GitCompare className="h-3.5 w-3.5" />
        Compare
      </Link>

      <Link
        to={createPageUrl('News')}
        className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium transition-all ring-1 ${
          isActive('News')
            ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
            : 'ring-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Newspaper className="h-3.5 w-3.5" />
        News
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggleBtn />
        <UserProfileMenu />
      </div>
    </nav>
  );
}

function AppShell({ children }) {
  const { theme } = useTheme();
  const bgColor = theme === 'light'
    ? 'radial-gradient(ellipse at 15% 0%, rgba(59,130,246,0.07), transparent 45%), radial-gradient(ellipse at 85% 0%, rgba(99,102,241,0.05), transparent 45%), linear-gradient(180deg, hsl(216,30%,96%), hsl(216,22%,93%))'
    : 'radial-gradient(circle at top left, rgba(14,165,233,0.12), transparent 30%), radial-gradient(circle at top right, rgba(250,204,21,0.07), transparent 26%), linear-gradient(180deg, hsl(222,47%,16%), hsl(222,47%,14%))';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: bgColor, colorScheme: theme }}>
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: theme === 'light'
            ? 'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)'
            : 'linear-gradient(rgba(30,41,59,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(30,41,59,0.25) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(to bottom, rgba(255,255,255,0.4), transparent 65%)',
        }}
      />
      <div className="relative z-10 flex h-full flex-col">
        <NavBar />
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children, currentPageName: _currentPageName }) {
  return (
    <ThemeProvider>
      <AppShell>
        {children}
      </AppShell>
    </ThemeProvider>
  );
}
