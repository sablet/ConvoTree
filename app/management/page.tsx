"use client"

import { TagManagement } from "@/components/tag-management"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { LineHistoryMenu } from "@/components/line-history-menu"
import { PageLayout } from "@/components/layouts/PageLayout"
import { useLines } from "@/hooks/use-lines"

export default function ManagementPage() {
  const { lines, reloadLines } = useLines()

  return (
    <PageLayout
      title="Tag Management"
      sidebar={
        <HamburgerMenu onDataReload={reloadLines}>
          <LineHistoryMenu lines={lines} />
        </HamburgerMenu>
      }
    >
      <TagManagement />
    </PageLayout>
  )
}
