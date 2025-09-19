# Suggested Development Commands

## Development Server
```bash
npm run dev        # Start development server on http://localhost:3000
npm run build      # Build production version
npm run start      # Start production server
npm run lint       # Run ESLint for code quality checks
```

## System Commands (Darwin/macOS)
```bash
# File operations
ls                 # List directory contents (/bin/ls)
find               # Search for files (/usr/bin/find) 
grep               # Search text (aliased with --color=always)

# Git operations
git status         # Check repository status
git add <files>    # Stage changes
git commit -m      # Commit changes
git push           # Push to remote
git pull           # Pull from remote
```

## Project Specific Commands
```bash
# Component generation (if using shadcn/ui CLI)
npx shadcn@latest add <component>

# Package management
npm install <package>          # Add dependency
npm install -D <package>       # Add dev dependency
npm update                     # Update dependencies
npm audit                      # Security audit
```

## Development Workflow
1. **Start Development**: `npm run dev`
2. **Code Quality**: `npm run lint` (before commits)
3. **Build Check**: `npm run build` (before deployment)
4. **Git Workflow**: 
   - `git status` → `git add .` → `git commit -m "message"` → `git push`

## File Watching and Hot Reload
- Next.js automatically watches file changes
- Browser auto-refreshes on save
- TypeScript compilation happens in real-time
- Tailwind CSS classes are JIT compiled

## Debugging
- Browser DevTools for client-side debugging
- Next.js provides source maps in development
- Console logging for component state inspection
- React DevTools browser extension recommended

## Notes
- No test framework currently configured
- No pre-commit hooks setup
- No husky or lint-staged configuration
- Manual code quality checks required