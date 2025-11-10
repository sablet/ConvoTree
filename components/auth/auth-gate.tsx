"use client"

import type { ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"
import { LoadingFallback } from "@/components/LoadingFallback"
import { FirebaseAuthUI } from "@/components/auth/firebase-auth-ui"

interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { user, loading } = useAuth()

  // デバッグモード: 認証をスキップ
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG_SKIP_AUTH === 'true'

  if (isDebugMode) {
    return <>{children}</>
  }

  if (loading) {
    return <LoadingFallback />
  }

  if (!user) {
    return <FirebaseAuthUI />
  }

  return <>{children}</>;
}
