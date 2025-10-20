import { ReactNode } from 'react'
import { PageLayout } from './PageLayout'

interface ChatLayoutProps {
  children: ReactNode
  sidebar?: ReactNode
  footer?: ReactNode
}

export function ChatLayout({ children, sidebar, footer }: ChatLayoutProps) {
  return (
    <PageLayout sidebar={sidebar} footer={footer}>
      <div className="space-y-4">
        {children}
      </div>
    </PageLayout>
  )
}