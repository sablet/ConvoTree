import { ReactNode } from 'react'

interface PageLayoutProps {
  title?: string
  children: ReactNode
  footer?: ReactNode
  sidebar?: ReactNode
}

export function PageLayout({ children, footer, sidebar }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <main className="w-full">
        <div className="flex">
          <div className="flex-1">
            {children}
          </div>
          {sidebar && (
            <aside className="w-80">
              {sidebar}
            </aside>
          )}
        </div>
      </main>

      {footer && (
        <footer className="border-t mt-auto">
          {footer}
        </footer>
      )}
    </div>
  )
}