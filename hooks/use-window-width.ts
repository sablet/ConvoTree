import { useState, useEffect } from 'react'

const SIDEBAR_WIDTH = 256 // px
const MIN_WIDTH_MULTIPLIER = 2

/**
 * Hook to track window width and determine sidebar display mode
 *
 * @returns Object containing:
 *   - windowWidth: Current window width in pixels
 *   - shouldAutoCollapse: True if window width < SIDEBAR_WIDTH * MIN_WIDTH_MULTIPLIER (sidebar should be auto-collapsed)
 */
export function useWindowWidth() {
  // デフォルト値を1920に設定してHydrationエラーを防ぐ（サーバー側ではデスクトップビューをレンダリング）
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1920
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    // Set initial value
    handleResize()

    // Add event listener
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const shouldAutoCollapse = windowWidth < SIDEBAR_WIDTH * MIN_WIDTH_MULTIPLIER

  return { windowWidth, shouldAutoCollapse }
}

