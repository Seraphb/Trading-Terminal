export const PROFILES_STORAGE_KEY = 'app-user-profiles';
export const ACTIVE_PROFILE_ID_KEY = 'app-active-user-id';
export const AUTH_SESSION_KEY = 'app-auth-session';
export const PROFILE_CHANGE_EVENT = 'app-user-profile-updated';

const DEFAULT_PROFILE = {
  id: 'local-user',
  email: 'user@local.dev',
  displayName: 'Local Trader',
  theme: 'dark',
  title: 'Independent Market Operator',
  location: 'Athens, Greece',
  bio: 'Watching structure, momentum, and clean execution across crypto and equities.',
  plan: 'Pro Workspace',
  initials: 'LT',
  joinedAt: '2026-01-01T00:00:00.000Z',
  password: '',
};

function buildInitials(displayName) {
  const words = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!words.length) return 'LT';
  return words.map((word) => word[0]?.toUpperCase() || '').join('');
}

export function createProfileDraft(seed = {}) {
  return {
    displayName: String(seed.displayName || '').trim(),
    email: String(seed.email || '').trim(),
    title: String(seed.title || 'Independent Market Operator').trim(),
    location: String(seed.location || 'Athens, Greece').trim(),
    bio: String(seed.bio || 'Focused on structure, momentum, and clean execution.').trim(),
    password: '',
    confirmPassword: '',
  };
}

export function sanitizeProfile(profile) {
  const next = {
    ...DEFAULT_PROFILE,
    ...profile,
  };

  next.id = String(next.id || DEFAULT_PROFILE.id).trim() || DEFAULT_PROFILE.id;
  next.displayName = String(next.displayName || DEFAULT_PROFILE.displayName).trim() || DEFAULT_PROFILE.displayName;
  next.email = String(next.email || DEFAULT_PROFILE.email).trim() || DEFAULT_PROFILE.email;
  next.theme = next.theme === 'light' ? 'light' : 'dark';
  next.title = String(next.title || DEFAULT_PROFILE.title).trim();
  next.location = String(next.location || DEFAULT_PROFILE.location).trim();
  next.bio = String(next.bio || DEFAULT_PROFILE.bio).trim();
  next.plan = String(next.plan || DEFAULT_PROFILE.plan).trim() || DEFAULT_PROFILE.plan;
  next.joinedAt = String(next.joinedAt || DEFAULT_PROFILE.joinedAt).trim() || DEFAULT_PROFILE.joinedAt;
  next.password = String(next.password || '').trim();
  next.initials = buildInitials(next.displayName);
  delete next.confirmPassword;
  delete next.profileCompletion;

  return next;
}

export function getDefaultProfiles() {
  return [sanitizeProfile(DEFAULT_PROFILE)];
}

export function readProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return getDefaultProfiles();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return getDefaultProfiles();
    return parsed.map((profile) => sanitizeProfile(profile));
  } catch {
    return getDefaultProfiles();
  }
}

export function readActiveProfileId(profiles = readProfiles()) {
  try {
    const stored = localStorage.getItem(ACTIVE_PROFILE_ID_KEY);
    if (stored && profiles.some((profile) => profile.id === stored)) return stored;
  } catch {}
  return profiles[0]?.id || DEFAULT_PROFILE.id;
}

export function readSessionProfileId(profiles = readProfiles()) {
  try {
    const stored = localStorage.getItem(AUTH_SESSION_KEY);
    if (stored && profiles.some((profile) => profile.id === stored)) return stored;
  } catch {}
  return null;
}

export function persistSessionProfileId(profileId) {
  try {
    if (profileId) localStorage.setItem(AUTH_SESSION_KEY, profileId);
    else localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {}
}

export function clearSessionProfileId() {
  persistSessionProfileId(null);
}

export function getActiveUserId() {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_ID_KEY) || DEFAULT_PROFILE.id;
  } catch {
    return DEFAULT_PROFILE.id;
  }
}

export function emitProfileChange(activeProfileId, profiles = []) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROFILE_CHANGE_EVENT, {
    detail: {
      activeProfileId,
      profiles,
    },
  }));
}

export function persistProfiles(profiles, activeProfileId) {
  const safeProfiles = Array.isArray(profiles) && profiles.length
    ? profiles.map((profile) => sanitizeProfile(profile))
    : getDefaultProfiles();
  const safeActiveProfileId = safeProfiles.some((profile) => profile.id === activeProfileId)
    ? activeProfileId
    : safeProfiles[0].id;

  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(safeProfiles));
    localStorage.setItem(ACTIVE_PROFILE_ID_KEY, safeActiveProfileId);
  } catch {}

  emitProfileChange(safeActiveProfileId, safeProfiles);
  return {
    profiles: safeProfiles,
    activeProfileId: safeActiveProfileId,
  };
}

export function getProfileCompletion(user) {
  const fields = [user.displayName, user.email, user.title, user.location, user.bio];
  const completed = fields.filter((value) => String(value || '').trim().length > 0).length;
  return Math.round((completed / fields.length) * 100);
}

export function makeProfileId(displayName) {
  const base = String(displayName || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'user';
  return `${base}-${Date.now().toString(36)}`;
}
