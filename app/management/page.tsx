"use client"

import { TagManagement } from "@/components/tag-management"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { PageLayout } from "@/components/layouts/PageLayout"

export default function ManagementPage() {
  return (
    <PageLayout sidebar={<HamburgerMenu />}>
      <TagManagement />
    </PageLayout>
  )
}
