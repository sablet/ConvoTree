"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import { LoadingFallback } from "@/components/LoadingFallback"
import { useAuth } from "@/lib/auth-context"
import { FirebaseAuthUI } from "@/components/auth/firebase-auth-ui"
import {
  AUTH_PROMPT_TITLE,
  AUTH_PROMPT_DESCRIPTION,
  AUTH_ERROR_PREFIX,
} from "@/lib/ui-strings"

interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { user, isLoading, error } = useAuth()

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

  return <>{children}</>;
}
