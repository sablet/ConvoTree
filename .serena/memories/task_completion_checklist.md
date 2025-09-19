# Task Completion Checklist

## Before Committing Code
1. **Code Quality Check**
   ```bash
   npm run lint          # Fix any ESLint errors
   ```

2. **Build Verification**
   ```bash
   npm run build         # Ensure production build succeeds
   ```

3. **Type Check** (Automatic with build, but can run separately)
   - TypeScript compilation happens during build
   - Check for any type errors in IDE/editor

## Development Workflow
1. **Start Development Server**
   ```bash
   npm run dev           # Development server with hot reload
   ```

2. **Code Changes**
   - Make changes to components/pages
   - Browser automatically refreshes
   - Monitor console for errors

3. **Pre-Commit Steps**
   ```bash
   npm run lint          # Check code style
   npm run build         # Verify production build
   git status            # Review changes
   git add .             # Stage changes
   git commit -m "..."   # Commit with descriptive message
   ```

## Deployment Preparation
1. **Production Build**
   ```bash
   npm run build         # Generate optimized build
   npm run start         # Test production server locally
   ```

2. **Dependency Audit**
   ```bash
   npm audit             # Check for security vulnerabilities
   npm audit fix         # Auto-fix if possible
   ```

## Code Review Guidelines
- **Component Structure**: Proper hooks usage, clean JSX
- **TypeScript**: All props and state properly typed
- **Styling**: Consistent Tailwind class usage
- **Accessibility**: Proper ARIA attributes where needed
- **Performance**: Avoid unnecessary re-renders

## Testing (Currently Not Configured)
- No test framework currently setup
- Manual testing in browser required
- Consider adding Jest + React Testing Library in future

## File Organization Check
- New components in appropriate directories
- Imports use `@/` path mapping
- No circular dependencies
- Consistent file naming conventions

## Git Best Practices
- Descriptive commit messages
- Atomic commits (one feature/fix per commit)
- Branch naming for features: `feature/branch-name`
- Regular pulls from main branch