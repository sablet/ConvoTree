import { useState, useEffect } from 'react'

export type DeviceType = 'desktop' | 'mobile'

/**
 * Detect device type based on touch capability
 * 
 * Uses pointer media query to detect if the primary input is coarse (touch)
 * or fine (mouse/trackpad). This is more reliable than screen size alone.
 * 
 * @returns 'desktop' for non-touch devices, 'mobile' for touch devices
 */
export function useDeviceType(): DeviceType {
  const [deviceType, setDeviceType] = useState<DeviceType>('mobile')

  useEffect(() => {
    const checkDeviceType = () => {
      // Check if primary pointer is coarse (touch)
      const isTouchDevice = window.matchMedia('(pointer: coarse)').matches
      setDeviceType(isTouchDevice ? 'mobile' : 'desktop')
    }

    // Initial check
    checkDeviceType()

    // Listen for changes (rare but possible with hybrid devices)
    const mediaQuery = window.matchMedia('(pointer: coarse)')
    
    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', checkDeviceType)
      return () => mediaQuery.removeEventListener('change', checkDeviceType)
    } 
    // Fallback for older browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(checkDeviceType)
      return () => mediaQuery.removeListener(checkDeviceType)
    }
  }, [])

  return deviceType
}

