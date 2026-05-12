'use client'
import { Suspense } from 'react'
import PosPageInner from '@/components/PosPageInner'

export default function PosPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fff5f3] flex items-center justify-center text-gray-400">
        กำลังโหลด...
      </div>
    }>
      <PosPageInner />
    </Suspense>
  )
}