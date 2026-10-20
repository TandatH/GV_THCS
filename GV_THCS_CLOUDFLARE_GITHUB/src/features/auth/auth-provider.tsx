"use client";

import { roles, type Role } from "@school/shared";
import {
  GoogleAuthProvider,
  type User,
  getIdTokenResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { firebaseAuth, initializeFirebaseAnalytics } from "@/lib/firebase/client";

export type AuthState = {
  user: User | null;
  role: Role | null;
  loading: boolean;
  claims: Record<string, unknown> | null;
  authError: string | null;
};

type AuthContextValue = AuthState & {
  refreshClaims: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

function roleFromClaims(claims: Record<string, unknown>): Role | null {
  const role = claims.role;
  return typeof role === "string" && roles.includes(role as Role) ? (role as Role) : null;
}

function routeState(user: User | null, claims: Record<string, unknown> | null): AuthState {
  return {
    user,
    role: claims ? roleFromClaims(claims) : null,
    claims,
    loading: false,
    authError: null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    claims: null,
    loading: true,
    authError: null,
  });

  const loadUser = useCallback(async (user: User) => {
    const token = await getIdTokenResult(user);
    return routeState(user, token.claims);
  }, []);

  const refreshClaims = useCallback(async () => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      setState(routeState(null, null));
      return;
    }
    await user.getIdToken(true);
    setState(await loadUser(user));
  }, [loadUser]);

  useEffect(() => {
    void initializeFirebaseAnalytics();
    let active = true;

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (!user) {
        if (active) setState(routeState(null, null));
        return;
      }

      void loadUser(user)
        .then((nextState) => {
          if (active) setState(nextState);
        })
        .catch(() => {
          if (active) {
            setState({
              user,
              role: null,
              claims: null,
              loading: false,
              authError: "Không thể đọc quyền tài khoản. Vui lòng đăng nhập lại.",
            });
          }
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      refreshClaims,
      signInWithEmail: async (emailOrUsername, password) => {
        let email = emailOrUsername.trim();
        if (!email.includes("@")) {
          email = `${email.toLowerCase()}@saodo.local`;
        }
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      },
      signInWithGoogle: async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        await signInWithPopup(firebaseAuth, provider);
      },
      signOutUser: async () => {
        await signOut(firebaseAuth);
      },
      sendPasswordReset: async (email) => {
        await sendPasswordResetEmail(firebaseAuth, email.trim());
      },
    }),
    [refreshClaims, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function dashboardPathForRole(role: Role, claims?: Record<string, unknown> | null) {
  if (claims?.userType === "sao_do" || claims?.isSaoDo) {
    return "/discipline/record";
  }
  if (role === "bgh") return "/bgh/dashboard";
  if (role === "totruong") return "/totruong/dashboard";
  if (role === "giaovien") return "/teacher/dashboard";
  return "/dashboard";
}
