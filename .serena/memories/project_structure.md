# Project Structure

## Root Directory
```
chat-line/
├── app/                    # Next.js App Router pages
├── components/             # React components
├── lib/                    # Utility functions
├── .serena/               # Serena configuration
├── .claude/               # Claude configuration
├── node_modules/          # Dependencies
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
├── tailwind.config.ts     # Tailwind CSS configuration
├── .eslintrc.json         # ESLint configuration
├── components.json        # shadcn/ui configuration
└── README.md              # Project documentation
```

## App Directory (`app/`)
```
app/
├── layout.tsx             # Root layout component
├── page.tsx               # Home page component
├── globals.css            # Global styles
├── favicon.ico            # Site favicon
└── fonts/                 # Custom font files
    ├── GeistVF.woff       # Geist variable font
    └── GeistMonoVF.woff   # Geist mono variable font
```

## Components Directory (`components/`)
```
components/
├── branching-chat-ui.tsx  # Main chat interface component
└── ui/                    # shadcn/ui components
    ├── button.tsx         # Button component
    ├── input.tsx          # Input component
    ├── badge.tsx          # Badge component
    └── dropdown-menu.tsx  # Dropdown menu component
```

## Library Directory (`lib/`)
```
lib/
└── utils.ts               # Utility functions (cn function for class merging)
```

## Configuration Files
- **package.json**: Dependencies, scripts, project metadata
- **tsconfig.json**: TypeScript compiler configuration
- **tailwind.config.ts**: Tailwind CSS customization
- **components.json**: shadcn/ui component configuration
- **next.config.mjs**: Next.js build configuration
- **postcss.config.mjs**: PostCSS plugins configuration

## Key Architectural Patterns
- **App Router**: Next.js 13+ app directory structure
- **Component Co-location**: UI components grouped by functionality
- **Absolute Imports**: `@/` path mapping for clean imports
- **Single Responsibility**: Each component has a focused purpose
- **Composition Pattern**: Building complex UI from simple components

## Import Path Strategy
- `@/components/*` - React components
- `@/lib/*` - Utility functions  
- `@/app/*` - Pages and layouts
- External packages imported normally

## File Naming Conventions
- **Components**: `kebab-case.tsx` (e.g., `branching-chat-ui.tsx`)
- **Pages**: `page.tsx` (Next.js App Router convention)
- **Layouts**: `layout.tsx` (Next.js App Router convention)
- **Utilities**: `kebab-case.ts` (e.g., `utils.ts`)
- **Types**: Typically inline or in component files