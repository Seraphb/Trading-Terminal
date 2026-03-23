// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { LockKeyhole, LogIn, Mail, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { createProfileDraft } from '@/lib/profileStore';
import { toast } from '@/components/ui/use-toast';

export default function LocalLoginScreen() {
  const { createProfile, login, profiles } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [createDraft, setCreateDraft] = useState(() => createProfileDraft({
    displayName: '',
    email: '',
    title: 'Independent Market Operator',
    location: 'Athens, Greece',
    bio: 'Focused on structure, momentum, and disciplined execution.',
  }));

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.email.toLowerCase() === email.trim().toLowerCase()),
    [email, profiles]
  );

  const handleLogin = (event) => {
    event.preventDefault();
    const result = login({ email, password });
    if (!result.ok) {
      toast({
        title: 'Login failed',
        description: result.message,
      });
      return;
    }
    toast({
      title: 'Signed in',
      description: `Welcome back, ${result.profile.displayName}.`,
    });
  };

  const handleCreate = (event) => {
    event.preventDefault();
    if (!createDraft.password.trim()) {
      toast({
        title: 'Password required',
        description: 'Set a password for the new local user.',
      });
      return;
    }
    if (createDraft.password !== createDraft.confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please confirm the same password.',
      });
      return;
    }

    try {
      const profile = createProfile(createDraft);
      toast({
        title: 'User created',
        description: `${profile.displayName} is now signed in.`,
      });
    } catch (error) {
      toast({
        title: 'Could not create user',
        description: error instanceof Error ? error.message : 'Unexpected local auth error.',
      });
    }
  };

  const updateCreateField = (field, value) => {
    setCreateDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(250,204,21,0.12),transparent_26%),linear-gradient(180deg,hsl(222,47%,11%),hsl(222,47%,9%))] px-4 py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-3xl border border-white/10 bg-[rgba(15,23,42,0.78)] p-6 shadow-2xl">
          <div className="mb-6">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-cyan-300 text-slate-950 shadow-lg shadow-blue-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold text-white">Local Sign In</h1>
            <p className="mt-2 text-sm text-slate-400">
              Each workspace user can now sign in and out locally, with their own watchlists and settings.
            </p>
          </div>

          <div className="mb-5 flex gap-2 rounded-2xl bg-[rgba(2,6,23,0.35)] p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                mode === 'login' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                mode === 'create' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Create user
            </button>
          </div>

          {mode === 'login' ? (
            <form className="space-y-4" onSubmit={handleLogin}>
              <label className="grid gap-2 text-sm text-slate-300">
                <span className="flex items-center gap-2 text-slate-400">
                  <Mail className="h-4 w-4 text-blue-400" />
                  Email
                </span>
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="border-white/10 bg-black/10 text-white"
                  placeholder="user@local.dev"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span className="flex items-center gap-2 text-slate-400">
                  <LockKeyhole className="h-4 w-4 text-amber-400" />
                  Password
                </span>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="border-white/10 bg-black/10 text-white"
                  placeholder={selectedProfile?.password ? 'Enter password' : 'Leave blank for legacy users'}
                />
              </label>

              <Button type="submit" className="w-full bg-blue-600 text-white hover:bg-blue-500">
                <LogIn className="h-4 w-4" />
                Sign in
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleCreate}>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Name</span>
                <Input
                  value={createDraft.displayName}
                  onChange={(event) => updateCreateField('displayName', event.target.value)}
                  className="border-white/10 bg-black/10 text-white"
                  placeholder="Desk name"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Email</span>
                <Input
                  value={createDraft.email}
                  onChange={(event) => updateCreateField('email', event.target.value)}
                  className="border-white/10 bg-black/10 text-white"
                  placeholder="new@local.dev"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Password</span>
                  <Input
                    type="password"
                    value={createDraft.password}
                    onChange={(event) => updateCreateField('password', event.target.value)}
                    className="border-white/10 bg-black/10 text-white"
                    placeholder="Required"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>Confirm</span>
                  <Input
                    type="password"
                    value={createDraft.confirmPassword}
                    onChange={(event) => updateCreateField('confirmPassword', event.target.value)}
                    className="border-white/10 bg-black/10 text-white"
                    placeholder="Repeat password"
                  />
                </label>
              </div>

              <Button type="submit" className="w-full bg-emerald-600 text-white hover:bg-emerald-500">
                <UserPlus className="h-4 w-4" />
                Create user and sign in
              </Button>
            </form>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-[rgba(15,23,42,0.62)] p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-2 text-slate-300">
            <Users className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Available Users</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  setMode('login');
                  setEmail(profile.email);
                  setPassword('');
                }}
                className="rounded-2xl border border-white/10 bg-[rgba(2,6,23,0.28)] p-4 text-left transition-all hover:border-sky-400/40 hover:bg-[rgba(15,23,42,0.82)]"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-300 to-orange-400 text-sm font-bold text-slate-950">
                  {profile.initials}
                </div>
                <div className="text-sm font-semibold text-white">{profile.displayName}</div>
                <div className="mt-1 text-xs text-slate-400">{profile.email}</div>
                <div className="mt-3 text-[11px] text-slate-500">
                  {profile.password ? 'Password protected' : 'Legacy local user'}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
