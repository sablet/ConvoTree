"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth"
import type { ReactNode } from "react"
import { auth } from "@/lib/firebase"

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  error: string | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const AUTH_CACHE_KEY = 'chat-line-auth-cache';

interface CachedAuthData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  timestamp: number;
}

const saveAuthToCache = (user: User | null) => {
  if (typeof window === 'undefined') return;

  try {
    if (user) {
      const cacheData: CachedAuthData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        timestamp: Date.now()
      };
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(cacheData));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch (error) {
    console.error('Failed to save auth cache:', error);
  }
};

const loadAuthFromCache = (): CachedAuthData | null => {
  if (typeof window === 'undefined') return null;

  try {
    const cached = localStorage.getItem(AUTH_CACHE_KEY);
    if (!cached) return null;

    const data = JSON.parse(cached) as CachedAuthData;
    const age = Date.now() - data.timestamp;
    const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7日

    if (age > MAX_CACHE_AGE) {
      localStorage.removeItem(AUTH_CACHE_KEY);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to load auth cache:', error);
    return null;
  }
};

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = loadAuthFromCache();
    if (cached && !navigator.onLine) {
      setUser({
        uid: cached.uid,
        email: cached.email,
        displayName: cached.displayName,
        photoURL: cached.photoURL,
      } as User);
      setIsLoading(false);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      saveAuthToCache(currentUser)
      setIsLoading(false)
      setError(null)
    }, (authError) => {
      const cachedAuth = loadAuthFromCache();
      if (cachedAuth && !navigator.onLine) {
        console.log('🔒 Using cached auth (offline mode)');
        setUser({
          uid: cachedAuth.uid,
          email: cachedAuth.email,
          displayName: cachedAuth.displayName,
          photoURL: cachedAuth.photoURL,
        } as User);
        setIsLoading(false);
        setError(null);
      } else {
        setError(authError.message)
        setIsLoading(false)
      }
    })

    return unsubscribe
  }, [])

  const signOut = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await firebaseSignOut(auth)
      saveAuthToCache(null)
      setError(null)
    } catch (signOutError) {
      if (signOutError instanceof Error) {
        setError(signOutError.message)
      } else {
        setError("サインアウトに失敗しました")
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    error,
    signOut,
  }), [user, isLoading, error, signOut])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
