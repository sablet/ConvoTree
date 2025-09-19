# Code Style and Conventions

## TypeScript Configuration
- **Strict Mode**: Enabled for type safety
- **Module System**: ESNext with bundler resolution
- **JSX**: Preserve mode for Next.js handling
- **Path Mapping**: `@/*` maps to project root
- **No Emit**: Compilation handled by Next.js

## Component Structure
- **Function Components**: All components use function syntax, not class components
- **Hooks Pattern**: Uses modern React hooks (useState, useEffect, useRef)
- **Export Pattern**: Named exports for reusable components, default export for pages

## File Organization
- **Component Files**: `.tsx` extension for components with JSX
- **Utility Files**: `.ts` extension for pure TypeScript
- **Naming Convention**: kebab-case for files, PascalCase for components
- **Barrel Exports**: UI components organized under `components/ui/`

## Import/Export Patterns
```typescript
// Import patterns observed:
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Send, Zap, Tag } from "lucide-react"

// Export patterns:
export function ComponentName() { ... }  // Named export
export default function Page() { ... }   // Default export for pages
```

## Styling Approach
- **Tailwind Classes**: Utility-first CSS approach
- **Conditional Classes**: Using clsx/tailwind-merge pattern
- **CSS Variables**: HSL color system with semantic names
- **Responsive Design**: Mobile-first with `max-w-md mx-auto` containers

## Interface Definitions
- **Clear Type Definitions**: All data structures explicitly typed
- **Optional Properties**: Proper use of `?` for optional fields
- **Generic Types**: State hooks properly typed (e.g., `useState<string>()`)

## Code Organization Patterns
- **Custom Hooks**: Logic extraction into reusable hooks
- **Event Handlers**: Descriptive naming (`handleSendMessage`, `handleImageFile`)
- **State Management**: Local state with useState, no external state library
- **Side Effects**: Proper cleanup in useEffect hooks

## Comments and Documentation
- **Minimal Comments**: Code is self-documenting through clear naming
- **No JSDoc**: No formal documentation comments observed
- **Inline Comments**: Only for complex business logic explanations