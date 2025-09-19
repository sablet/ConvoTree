# Tech Stack and Dependencies

## Frontend Framework
- **Next.js 14.2.25**: React framework with App Router
- **React 19**: Latest React version with hooks and modern patterns
- **TypeScript**: Full TypeScript support with strict mode enabled

## UI and Styling
- **Tailwind CSS 4.1.9**: Utility-first CSS framework
- **Radix UI**: Comprehensive component library for accessibility
  - Various components: Dialog, Dropdown, Button, Input, etc.
- **shadcn/ui**: Component system built on Radix UI
- **Lucide React**: Icon library
- **CSS Variables**: Custom color scheme with HSL values
- **Dark Mode Support**: Built into Tailwind configuration

## Development Tools
- **ESLint**: Code linting with Next.js recommended rules
- **PostCSS**: CSS processing with Tailwind integration
- **Autoprefixer**: CSS vendor prefixing

## Key Dependencies
- **clsx + tailwind-merge**: Conditional CSS class handling
- **date-fns**: Date manipulation utilities
- **next-themes**: Theme switching functionality
- **Geist Font**: Custom font family from Vercel

## Build System
- **Next.js built-in bundler**: Uses SWC for fast compilation
- **TypeScript compiler**: Incremental compilation enabled
- **Module resolution**: Bundler strategy for modern builds

## Notable Characteristics
- No testing framework currently configured
- No backend/API dependencies
- Client-side only application
- Modern ES modules and JSX/TSX support