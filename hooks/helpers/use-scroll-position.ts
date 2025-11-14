import { useState, useCallback } from 'react'

interface UseScrollPositionProps {
  messagesContainerRef: React.RefObject<HTMLDivElement>
}

export function useScrollPosition({ messagesContainerRef }: UseScrollPositionProps) {
  const [scrollPositions, setScrollPositions] = useState<Map<string, number>>(new Map())

  const saveScrollPosition = useCallback((lineId: string) => {
    if (messagesContainerRef.current) {
      const scrollTop = messagesContainerRef.current.scrollTop
      setScrollPositions(prev => new Map(prev).set(lineId, scrollTop))
    }
  }, [messagesContainerRef])

  const restoreScrollPosition = useCallback((lineId: string) => {
    const savedPosition = scrollPositions.get(lineId)
    if (savedPosition !== undefined && messagesContainerRef.current) {
      // Delay slightly to wait for DOM updates
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = savedPosition
        }
      }, 50)
    }
  }, [scrollPositions, messagesContainerRef])

  return {
    scrollPositions,
    saveScrollPosition,
    restoreScrollPosition,
    setScrollPositions
  }
}


