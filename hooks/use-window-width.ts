import { useState, useEffect } from 'react'

const SIDEBAR_WIDTH = 256 // px
const MIN_WIDTH_MULTIPLIER = 2

/**
 * Hook to track window width and determine if sidebar should be visible
 * 
 * @returns Object containing:
 *   - windowWidth: Current window width in pixels
 *   - shouldShowSidebar: True if window width >= SIDEBAR_WIDTH * MIN_WIDTH_MULTIPLIER
 */
export function useWindowWidth() {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 0
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

  const shouldShowSidebar = windowWidth >= SIDEBAR_WIDTH * MIN_WIDTH_MULTIPLIER

  return { windowWidth, shouldShowSidebar }
}

