"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import { LoadingFallback } from "@/components/LoadingFallback"
import { useAuth } from "@/lib/auth-context"
import { FirebaseAuthUI } from "@/components/auth/firebase-auth-ui"
import {
  AUTH_PROMPT_TITLE,
  AUTH_PROMPT_DESCRIPTION,
  AUTH_LOGOUT,
  AUTH_ERROR_PREFIX,
} from "@/lib/ui-strings"

interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { user, isLoading, error, signOut } = useAuth()

  if (isLoading && !user) {
    return <LoadingFallback />
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-8 space-y-6">
          <div className="flex justify-center">
            <Image src="/icon-192.png" alt="Chat Line" width={64} height={64} className="rounded-2xl" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">{AUTH_PROMPT_TITLE}</h1>
            <p className="text-sm text-slate-600">{AUTH_PROMPT_DESCRIPTION}</p>
          </div>
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <span className="block font-medium">{AUTH_ERROR_PREFIX}</span>
              <span className="break-words">{error}</span>
            </div>
          )}
          <FirebaseAuthUI />
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex max-w-xs items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs text-slate-700 shadow-md backdrop-blur">
        <span className="truncate">{user.email ?? user.displayName ?? user.uid}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="pointer-events-auto rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          {AUTH_LOGOUT}
        </button>
      </div>
      {children}
    </div>
  )
}
