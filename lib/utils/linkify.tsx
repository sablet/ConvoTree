import React from 'react'

// URL detection regex pattern
// Matches http:// and https:// URLs
const URL_REGEX = /(https?:\/\/[^\s]+)/g

interface LinkifiedTextProps {
  text: string
}

/**
 * Convert URLs in text to clickable links
 */
export function LinkifiedText({ text }: LinkifiedTextProps) {
  const parts = text.split(URL_REGEX)
  
  return (
    <>
      {parts.map((part, index) => {
        // Check if this part is a URL
        if (part.match(URL_REGEX)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          )
        }
        
        // Regular text
        return <span key={index}>{part}</span>
      })}
    </>
  )
}

/**
 * Detect if text contains any URLs
 */
export function containsUrl(text: string): boolean {
  return URL_REGEX.test(text)
}

/**
 * Count text length excluding URLs
 */
export function countTextLengthWithoutUrls(text: string): number {
  // Remove all URLs from text and count remaining characters
  const textWithoutUrls = text.replace(URL_REGEX, '')
  return textWithoutUrls.length
}

