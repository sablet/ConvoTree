import { ReactNode } from 'react'

interface PageLayoutProps {
  title?: string
  children: ReactNode
  footer?: ReactNode
  sidebar?: ReactNode
}

export function PageLayout({ title, children, footer, sidebar }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {title && (
        <header className="border-b">
          <div className="container mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
        </header>
      )}

      <main className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
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