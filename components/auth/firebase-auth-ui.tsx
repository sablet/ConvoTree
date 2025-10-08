"use client"

import { useEffect, useRef } from "react"
import { GoogleAuthProvider } from "firebase/auth"
import { auth } from "@/lib/firebase"

const uiConfig = {
  signInFlow: 'popup', // 静的サイトではポップアップを推奨
  signInOptions: [
    {
      provider: GoogleAuthProvider.PROVIDER_ID,
      customParameters: {
        prompt: 'select_account', // 常にアカウント選択画面を表示
      },
    },
  ],
  callbacks: {
    signInSuccessWithAuthResult: () => false, // 自動リダイレクトを無効化（onAuthStateChangedで処理）
  },
}

export function FirebaseAuthUI() {
  const uiInstanceRef = useRef<unknown>(undefined)

  useEffect(() => {
    let isMounted = true

    void import("firebaseui").then((firebaseui) => {
      if (!isMounted) {
        return
      }

      const ui = firebaseui.auth.AuthUI.getInstance() ?? new firebaseui.auth.AuthUI(auth)
      uiInstanceRef.current = ui
      ui.start("#firebaseui-auth-container", uiConfig)
    })

    return () => {
      isMounted = false
      const maybeUi = uiInstanceRef.current as { delete: () => Promise<void>; reset: () => void } | undefined
      if (maybeUi) {
        void maybeUi.delete().catch(() => {
          maybeUi.reset()
        })
      }
    }
  }, [])

  return <div id="firebaseui-auth-container" />
}
