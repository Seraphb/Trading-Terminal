import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearSessionProfileId,
  createProfileDraft,
  getDefaultProfiles,
  getProfileCompletion,
  makeProfileId,
  persistProfiles,
  persistSessionProfileId,
  readActiveProfileId,
  readProfiles,
  readSessionProfileId,
  sanitizeProfile,
} from '@/lib/profileStore';

const AuthContext = createContext(null);

function useLocalProfilesState() {
  const [profiles, setProfiles] = useState(() => getDefaultProfiles());
  const [activeProfileId, setActiveProfileId] = useState(() => getDefaultProfiles()[0].id);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const nextProfiles = readProfiles();
    const nextActiveProfileId = readActiveProfileId(nextProfiles);
    const sessionProfileId = readSessionProfileId(nextProfiles);

    setProfiles(nextProfiles);
    setActiveProfileId(sessionProfileId || nextActiveProfileId);
    setIsAuthenticated(Boolean(sessionProfileId));
    setIsLoadingAuth(false);
  }, []);

  const syncProfiles = useCallback((nextProfiles, nextActiveProfileId) => {
    const persisted = persistProfiles(nextProfiles, nextActiveProfileId);
    setProfiles(persisted.profiles);
    setActiveProfileId(persisted.activeProfileId);
    return persisted;
  }, []);

  return {
    profiles,
    activeProfileId,
    isAuthenticated,
    isLoadingAuth,
    setIsAuthenticated,
    syncProfiles,
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export const AuthProvider = ({ children }) => {
  const {
    profiles,
    activeProfileId,
    isAuthenticated,
    isLoadingAuth,
    setIsAuthenticated,
    syncProfiles,
  } = useLocalProfilesState();
  const [isLoadingPublicSettings] = useState(false);

  const user = useMemo(() => {
    const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0] || getDefaultProfiles()[0];
    return {
      ...activeProfile,
      profileCompletion: getProfileCompletion(activeProfile),
    };
  }, [activeProfileId, profiles]);

  const switchProfile = useCallback((profileId) => {
    if (!profiles.some((profile) => profile.id === profileId)) return null;
    persistSessionProfileId(profileId);
    setIsAuthenticated(true);
    return syncProfiles(profiles, profileId);
  }, [profiles, setIsAuthenticated, syncProfiles]);

  const login = useCallback(({ email, password }) => {
    const normalizedEmail = normalizeEmail(email);
    const candidate = profiles.find((profile) => normalizeEmail(profile.email) === normalizedEmail);

    if (!candidate) {
      return { ok: false, message: 'No user found for that email.' };
    }

    const expectedPassword = String(candidate.password || '');
    const providedPassword = String(password || '');
    if (expectedPassword && expectedPassword !== providedPassword) {
      return { ok: false, message: 'Incorrect password.' };
    }
    if (!expectedPassword && providedPassword) {
      return { ok: false, message: 'This local user does not use a password yet. Leave it blank or set one from the profile screen.' };
    }

    persistSessionProfileId(candidate.id);
    setIsAuthenticated(true);
    syncProfiles(profiles, candidate.id);
    return { ok: true, profile: candidate };
  }, [profiles, setIsAuthenticated, syncProfiles]);

  const logout = useCallback(() => {
    clearSessionProfileId();
    setIsAuthenticated(false);
  }, [setIsAuthenticated]);

  const updateProfile = useCallback((updates) => {
    const nextProfiles = profiles.map((profile) => {
      if (profile.id !== activeProfileId) return profile;
      const nextPassword = String(updates.password || '').trim();
      return sanitizeProfile({
        ...profile,
        ...updates,
        password: nextPassword ? nextPassword : profile.password,
      });
    });
    return syncProfiles(nextProfiles, activeProfileId);
  }, [activeProfileId, profiles, syncProfiles]);

  const resetProfile = useCallback(() => {
    const current = profiles.find((profile) => profile.id === activeProfileId);
    if (!current) return null;
    const nextProfiles = profiles.map((profile) => (
      profile.id === activeProfileId
        ? sanitizeProfile({
            id: current.id,
            joinedAt: current.joinedAt,
            password: current.password,
          })
        : profile
    ));
    return syncProfiles(nextProfiles, activeProfileId);
  }, [activeProfileId, profiles, syncProfiles]);

  const createProfile = useCallback((seed) => {
    const draft = createProfileDraft(seed);
    const password = String(seed.password || '').trim();
    const normalizedEmail = normalizeEmail(draft.email);

    if (!normalizedEmail) {
      throw new Error('Email is required.');
    }
    if (profiles.some((profile) => normalizeEmail(profile.email) === normalizedEmail)) {
      throw new Error('A user with that email already exists.');
    }

    const profile = sanitizeProfile({
      ...draft,
      password,
      id: makeProfileId(draft.displayName),
      joinedAt: new Date().toISOString(),
    });
    const nextProfiles = [...profiles, profile];
    persistSessionProfileId(profile.id);
    setIsAuthenticated(true);
    syncProfiles(nextProfiles, profile.id);
    return profile;
  }, [profiles, setIsAuthenticated, syncProfiles]);

  const value = useMemo(() => ({
    user,
    profiles,
    activeProfileId,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError: null,
    appPublicSettings: null,
    login,
    logout,
    resetProfile,
    updateProfile,
    createProfile,
    switchProfile,
    navigateToLogin: logout,
    checkAppState: () => {},
  }), [
    activeProfileId,
    createProfile,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    login,
    logout,
    profiles,
    resetProfile,
    switchProfile,
    updateProfile,
    user,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
