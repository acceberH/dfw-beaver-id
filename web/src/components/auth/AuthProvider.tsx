"use client";

import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
  type ConfirmSignUpInput,
  type SignInInput,
  type SignUpInput,
} from "aws-amplify/auth";
import { Amplify } from "aws-amplify";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type AuthUser = {
  username: string;
};

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  error: string;
  demoMode: boolean;
  refresh: () => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  confirmSignUp: (input: ConfirmSignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let amplifyConfigured = false;

async function ensureAmplifyConfigured() {
  if (amplifyConfigured) return;
  const region = process.env.NEXT_PUBLIC_COGNITO_REGION || "";
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "";
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID || "";

  if (!userPoolId || !userPoolClientId) {
    // Fallback for local dev or environments that don't inline build-time env.
    const response = await fetch("/api/auth/config", { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Failed to load auth config.");
    }
    const cfg = (await response.json()) as {
      region: string;
      userPoolId: string;
      userPoolClientId: string;
    };
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: cfg.userPoolId,
          userPoolClientId: cfg.userPoolClientId,
        },
      },
    });
    amplifyConfigured = true;
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  });

  amplifyConfigured = true;
}

export function AuthProvider(props: { children: React.ReactNode }) {
  // The public portfolio deployment has no Cognito backend.  Keep it usable by
  // default; set this explicitly to "0" only when a real Cognito deployment is
  // configured.
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "0";
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    if (demoMode) {
      setUser({ username: "Demo" });
      setReady(true);
      return;
    }
    try {
      await ensureAmplifyConfigured();
      const current = await getCurrentUser().catch(() => null);
      setUser(current ? { username: current.username } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, [demoMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apiSignIn = useCallback(
    async (input: SignInInput) => {
      setError("");
      if (demoMode) return;
      await ensureAmplifyConfigured();
      await signIn(input);
      await refresh();
    },
    [demoMode, refresh],
  );

  const apiSignUp = useCallback(async (input: SignUpInput) => {
    setError("");
    if (demoMode) return;
    await ensureAmplifyConfigured();
    await signUp(input);
  }, [demoMode]);

  const apiConfirm = useCallback(
    async (input: ConfirmSignUpInput) => {
      setError("");
      if (demoMode) return;
      await ensureAmplifyConfigured();
      await confirmSignUp(input);
    },
    [demoMode],
  );

  const apiSignOut = useCallback(async () => {
    setError("");
    if (demoMode) {
      setUser({ username: "Demo" });
      return;
    }
    await ensureAmplifyConfigured();
    await signOut();
    await refresh();
  }, [demoMode, refresh]);

  const getIdToken = useCallback(async () => {
    if (demoMode) return null;
    await ensureAmplifyConfigured();
    const session = await fetchAuthSession().catch(() => null);
    const token = session?.tokens?.idToken?.toString() || null;
    return token;
  }, [demoMode]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      error,
      demoMode,
      refresh,
      signIn: apiSignIn,
      signUp: apiSignUp,
      confirmSignUp: apiConfirm,
      signOut: apiSignOut,
      getIdToken,
    }),
    [apiConfirm, apiSignIn, apiSignOut, apiSignUp, demoMode, error, getIdToken, ready, refresh, user],
  );

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider />");
  return ctx;
}
