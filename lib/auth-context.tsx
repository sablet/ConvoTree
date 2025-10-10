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

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Firebase Authが自動的に永続化を処理
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setIsLoading(false)
      setError(null)
    }, (authError) => {
      setError(authError.message)
      setIsLoading(false)
    })

    return unsubscribe
  }, [])

  const signOut = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await firebaseSignOut(auth)
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
