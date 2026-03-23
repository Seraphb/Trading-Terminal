// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Briefcase,
  Check,
  LockKeyhole,
  Mail,
  MapPin,
  PencilLine,
  RotateCcw,
  Save,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { createProfileDraft } from '@/lib/profileStore';
import {
  getStockWatchlist,
  getTerminalWatchlist,
  subscribeStockWatchlist,
  subscribeTerminalWatchlist,
} from '@/lib/watchlists';
import { useTheme } from '@/components/ThemeContext';

function StatCard({ label, value, accent }) {
  return (
    <div
      className="rounded-2xl border px-3 py-3"
      style={{
        borderColor: 'rgba(148, 163, 184, 0.16)',
        background: 'rgba(15, 23, 42, 0.35)',
      }}
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

export default function UserProfileMenu() {
  const {
    activeProfileId,
    logout,
    profiles,
    resetProfile,
    switchProfile,
    updateProfile,
    user,
  } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [stockCount, setStockCount] = useState(() => getStockWatchlist().length);
  const [terminalCount, setTerminalCount] = useState(() => getTerminalWatchlist().length);
  const [draft, setDraft] = useState(() => createProfileDraft(user));

  useEffect(() => subscribeStockWatchlist((symbols) => setStockCount(symbols.length)), []);
  useEffect(() => subscribeTerminalWatchlist((symbols) => setTerminalCount(symbols.length)), []);

  useEffect(() => {
    if (!isOpen) {
      setDraft(createProfileDraft(user));
      return;
    }
    setDraft(createProfileDraft(user));
  }, [isOpen, user]);

  const currentWorkspace = useMemo(() => {
    const page = location.pathname === '/' ? 'Terminal' : location.pathname.replace('/', '');
    return page || 'Terminal';
  }, [location.pathname]);

  const shellSurface = theme === 'light'
    ? {
        border: '1px solid rgba(148, 163, 184, 0.24)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(241,245,249,0.92))',
        color: 'hsl(222, 47%, 12%)',
      }
    : {
        border: '1px solid rgba(148, 163, 184, 0.12)',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.92), rgba(15,23,42,0.82))',
        color: 'rgb(226 232 240)',
      };

  const triggerSurface = theme === 'light'
    ? {
        border: '1px solid rgba(148, 163, 184, 0.26)',
        background: 'rgba(255,255,255,0.85)',
        color: 'hsl(222, 47%, 12%)',
      }
    : {
        border: '1px solid rgba(148, 163, 184, 0.14)',
        background: 'rgba(15,23,42,0.7)',
        color: 'rgb(226 232 240)',
      };

  const updateDraftField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const openEditDialog = () => {
    setDraft(createProfileDraft(user));
    setIsOpen(true);
  };

  const handleSave = () => {
    if (draft.password && draft.password !== draft.confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please confirm the same password.',
      });
      return;
    }
    updateProfile(draft);
    setIsOpen(false);
    toast({
      title: 'Profile updated',
      description: 'Your active workspace profile was saved.',
    });
  };

  const handleReset = () => {
    resetProfile();
    setIsOpen(false);
    toast({
      title: 'Profile reset',
      description: 'The active workspace profile was restored to the default setup.',
    });
  };

  const handleSwitchProfile = (profileId) => {
    const target = profiles.find((profile) => profile.id === profileId);
    if (!target || profileId === activeProfileId) return;
    switchProfile(profileId);
    setDraft(createProfileDraft(target));
    toast({
      title: 'Switched user',
      description: `You are now using ${target.displayName}.`,
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-3 rounded-2xl px-2.5 py-1.5 text-left transition-all hover:translate-y-[-1px]"
            style={triggerSurface}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-yellow-300 to-orange-400 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20">
              {user.initials}
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-sm font-semibold">{user.displayName}</div>
              <div className="truncate text-[11px] text-slate-500">{user.plan}</div>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[22rem] rounded-2xl border-none p-2 shadow-2xl"
          style={shellSurface}
        >
          <DropdownMenuLabel className="px-3 pt-2 pb-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-300 to-orange-400 text-sm font-bold text-slate-950">
                {user.initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold" style={{ color: shellSurface.color }}>{user.displayName}</div>
                <div className="truncate text-xs text-slate-500">{user.email}</div>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <ShieldCheck className="h-3 w-3" />
                  Local authenticated session
                </div>
              </div>
            </div>
          </DropdownMenuLabel>

          <div className="grid grid-cols-3 gap-2 px-2 pb-2">
            <StatCard label="Profile" value={`${user.profileCompletion}%`} accent="#facc15" />
            <StatCard label="Stocks" value={stockCount} accent="#34d399" />
            <StatCard label="Crypto" value={terminalCount} accent="#60a5fa" />
          </div>

          <div className="rounded-xl border px-3 py-2 text-xs text-slate-500" style={{ borderColor: 'rgba(148, 163, 184, 0.12)' }}>
            Active workspace: <span className="font-semibold text-slate-300" style={{ color: shellSurface.color }}>{currentWorkspace}</span>
          </div>

          <DropdownMenuSeparator className="my-2 bg-white/10" />

          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Users
          </div>
          {profiles.map((profile) => (
            <DropdownMenuItem
              key={profile.id}
              className="rounded-xl"
              onSelect={(event) => {
                event.preventDefault();
                handleSwitchProfile(profile.id);
              }}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-800/70 text-[11px] font-bold text-slate-200">
                {profile.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{profile.displayName}</div>
                <div className="truncate text-[11px] text-slate-500">{profile.email}</div>
              </div>
              {profile.id === activeProfileId ? <Check className="h-4 w-4 text-emerald-400" /> : null}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator className="my-2 bg-white/10" />

          <DropdownMenuItem
            className="rounded-xl"
            onSelect={(event) => {
              event.preventDefault();
              openEditDialog();
            }}
          >
            <PencilLine className="h-4 w-4" />
            Edit active profile
          </DropdownMenuItem>

          <DropdownMenuItem
            className="rounded-xl text-amber-400 focus:text-amber-300"
            onSelect={(event) => {
              event.preventDefault();
              handleReset();
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Reset active profile
          </DropdownMenuItem>

          <DropdownMenuItem
            className="rounded-xl text-red-400 focus:text-red-300"
            onSelect={(event) => {
              event.preventDefault();
              logout();
            }}
          >
            <LockKeyhole className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="overflow-hidden border-none p-0 sm:max-w-4xl"
          style={shellSurface}
        >
          <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-b p-6 lg:border-b-0 lg:border-r" style={{ borderColor: 'rgba(148, 163, 184, 0.12)' }}>
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-yellow-300 to-orange-400 text-xl font-bold text-slate-950 shadow-lg shadow-amber-500/20">
                {user.initials}
              </div>

              <DialogHeader className="mt-5 space-y-2 text-left">
                <DialogTitle className="text-xl font-semibold" style={{ color: shellSurface.color }}>
                  Profile
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500">
                  Edit the active profile or switch to another local user from the list below.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 space-y-3">
                <StatCard label="Completion" value={`${user.profileCompletion}%`} accent="#facc15" />
                <StatCard label="Stock Watchlist" value={stockCount} accent="#34d399" />
                <StatCard label="Crypto Watchlist" value={terminalCount} accent="#60a5fa" />
              </div>

              <div className="mt-6">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  Workspace users
                </div>
                <div className="space-y-2">
                  {profiles.map((profile) => {
                    const isActive = profile.id === activeProfileId;
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => handleSwitchProfile(profile.id)}
                        className={`w-full rounded-2xl border px-3 py-2 text-left transition-all ${
                          isActive ? 'ring-1 ring-blue-400/40' : ''
                        }`}
                        style={{
                          borderColor: isActive ? 'rgba(96,165,250,0.35)' : 'rgba(148,163,184,0.12)',
                          background: isActive ? 'rgba(59,130,246,0.10)' : 'rgba(15,23,42,0.24)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/70 text-[11px] font-bold text-slate-200">
                            {profile.initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold" style={{ color: shellSurface.color }}>{profile.displayName}</div>
                            <div className="truncate text-[11px] text-slate-500">{profile.email}</div>
                          </div>
                          {isActive ? <Check className="h-4 w-4 text-emerald-400" /> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Star className="h-4 w-4 text-amber-400" />
                    Display name
                  </span>
                  <Input
                    value={draft.displayName}
                    onChange={(event) => updateDraftField('displayName', event.target.value)}
                    className="border-white/10 bg-black/10 text-inherit"
                    placeholder="Local Trader"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Mail className="h-4 w-4 text-blue-400" />
                    Email
                  </span>
                  <Input
                    value={draft.email}
                    onChange={(event) => updateDraftField('email', event.target.value)}
                    className="border-white/10 bg-black/10 text-inherit"
                    placeholder="user@local.dev"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-400">
                    <Briefcase className="h-4 w-4 text-emerald-400" />
                    Title
                  </span>
                  <Input
                    value={draft.title}
                    onChange={(event) => updateDraftField('title', event.target.value)}
                    className="border-white/10 bg-black/10 text-inherit"
                    placeholder="Independent Market Operator"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-400">
                    <MapPin className="h-4 w-4 text-orange-400" />
                    Location
                  </span>
                  <Input
                    value={draft.location}
                    onChange={(event) => updateDraftField('location', event.target.value)}
                    className="border-white/10 bg-black/10 text-inherit"
                    placeholder="Athens, Greece"
                  />
                </label>
              </div>

              <label className="mt-4 grid gap-2 text-sm">
                <span className="text-slate-400">Bio</span>
                <Textarea
                  value={draft.bio}
                  onChange={(event) => updateDraftField('bio', event.target.value)}
                  className="min-h-[120px] border-white/10 bg-black/10 text-inherit"
                  placeholder="Short profile summary for this workspace."
                />
              </label>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="text-slate-400">
                    New password
                  </span>
                  <Input
                    type="password"
                    value={draft.password}
                    onChange={(event) => updateDraftField('password', event.target.value)}
                    className="border-white/10 bg-black/10 text-inherit"
                    placeholder="Leave blank to keep current"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-slate-400">Confirm password</span>
                  <Input
                    type="password"
                    value={draft.confirmPassword}
                    onChange={(event) => updateDraftField('confirmPassword', event.target.value)}
                    className="border-white/10 bg-black/10 text-inherit"
                    placeholder="Repeat password"
                  />
                </label>
              </div>

              <DialogFooter className="mt-6 gap-2">
                <Button variant="outline" onClick={handleReset} className="border-white/10 bg-transparent">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button onClick={handleSave} className="bg-blue-600 text-white hover:bg-blue-500">
                  <Save className="h-4 w-4" />
                  Save profile
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
