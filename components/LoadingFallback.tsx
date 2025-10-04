import { LOADING_GENERIC } from "@/lib/ui-strings"

export function LoadingFallback() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">{LOADING_GENERIC}</p>
      </div>
    </div>
  )
}
