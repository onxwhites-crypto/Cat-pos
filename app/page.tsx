'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import imageCompression from 'browser-image-compression'

export default function Dashboard() {
  const [todaySales, setTodaySales] = useState(0)
  const [todayBillCount, setTodayBillCount] = useState(0)
  const [pendingDeliveries, setPendingDeliveries] = useState(0)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [unpaidTotal, setUnpaidTotal] = useState(0)
  const [stockInDate, setStockInDate] = useState<string | null>(null)
  const [stockOutDate, setStockOutDate] = useState<string | null>(null)
  const [dateStr, setDateStr] = useState('')
  const [profileUrl, setProfileUrl] = useState<string | null>(null)
  const [uploadingProfile, setUploadingProfile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString('th-TH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    )
    fetchDashboard()
    loadProfilePhoto()
  }, [])

  async function loadProfilePhoto() {
    // ดึง URL รูปโปรไฟล์จาก Supabase Storage
    try {
      const { data } = supabase.storage.from('products').getPublicUrl('profile/shop-avatar.jpg')
      if (data?.publicUrl) {
        // เช็คว่ารูปมีจริงไหม
        const res = await fetch(data.publicUrl, { method: 'HEAD' })
        if (res.ok) setProfileUrl(data.publicUrl + '?t=' + Date.now())
      }
    } catch {}
  }

  async function handleProfileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingProfile(true)
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.3, maxWidthOrHeight: 400, useWebWorker: true,
      })
      const { error } = await supabase.storage
        .from('products')
        .upload('profile/shop-avatar.jpg', compressed, { upsert: true, contentType: 'image/jpeg' })
      if (!error) {
        await loadProfilePhoto()
      } else {
        alert('อัพโหลดไม่สำเร็จค่ะ: ' + error.message)
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setUploadingProfile(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function fetchDashboard() {
    const today = new Date().toISOString().split('T')[0]

    const { data: sales } = await supabase
      .from('orders')
      .select('total')
      .gte('order_date', today)
      .eq('payment_status', 'paid')
    setTodaySales(sales?.reduce((sum, o) => sum + o.total, 0) || 0)
    setTodayBillCount(sales?.length || 0)

    // ✅ นับทั้ง pending + packed (รอแพ๊ค + แพ๊คแล้วรอส่ง)
    const { count: deliveries } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact' })
      .in('status', ['pending', 'packed'])
      .lte('scheduled_date', today)
      .neq('scheduled_date', '2099-12-31')
    setPendingDeliveries(deliveries || 0)

    const { data: unpaid } = await supabase
      .from('orders')
      .select('total')
      .eq('payment_status', 'pending')
    setUnpaidCount(unpaid?.length || 0)
    setUnpaidTotal(unpaid?.reduce((sum, o) => sum + o.total, 0) || 0)

    const { data: latestRound } = await supabase
      .from('delivery_rounds')
      .select('stock_date, delivery_date')
      .order('delivery_date', { ascending: false })
      .limit(1)
      .single()
    if (latestRound) {
      setStockInDate(latestRound.stock_date)
      setStockOutDate(latestRound.delivery_date)
    }
  }

  function formatThaiDate(dateStr: string | null) {
    if (!dateStr) return '-'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short',
    })
  }

  const menus = [
    { href: '/pos',        emoji: '🛒', label: 'ขายของ',         sub: 'POS',          bg: 'from-orange-400 to-rose-400' },
    { href: '/post',       emoji: '📢', label: 'โพสขาย',         sub: 'Facebook',     bg: 'from-blue-400 to-sky-400' },
    { href: '/receiving',  emoji: '📦', label: 'สั่งออเดอร์',     sub: 'Order',        bg: 'from-indigo-400 to-violet-400' },
    { href: '/parcels',    emoji: '📥', label: 'รับพัสดุ',        sub: 'Parcels',      bg: 'from-teal-400 to-emerald-400' },
    { href: '/stock',      emoji: '🗃️', label: 'คลังสินค้า',     sub: 'Stock',        bg: 'from-cyan-500 to-blue-500' },
    { href: '/orders',     emoji: '📋', label: 'ประวัติการขาย',   sub: 'Orders',       bg: 'from-sky-400 to-cyan-400' },
    { href: '/delivery',   emoji: '🛵', label: 'เดลิเวอรี่',      sub: 'Delivery',     bg: 'from-green-400 to-lime-400' },
    { href: '/customers',  emoji: '👤', label: 'ลูกค้า',          sub: 'Customers',    bg: 'from-purple-400 to-fuchsia-400' },
    { href: '/finance',    emoji: '💰', label: 'การเงิน',         sub: 'Finance',      bg: 'from-yellow-400 to-amber-400' },
    { href: '/promotions', emoji: '🎁', label: 'โปรโมชั่น',       sub: 'Promotions',   bg: 'from-pink-400 to-rose-400' },
    { href: '/debts',      emoji: '💳', label: 'หนี้สิน',         sub: 'Debts',        bg: 'from-red-400 to-rose-500' },
    { href: '/import',     emoji: '🔄', label: 'Import / Export', sub: 'สินค้า',       bg: 'from-slate-400 to-gray-500' },
    { href: '/settings',   emoji: '⚙️', label: 'ตั้งค่า',         sub: 'Settings',     bg: 'from-gray-400 to-slate-500' },
  ]

  return (
    <main className="min-h-screen bg-[#fff5f3]">
      <div className="max-w-md mx-auto pb-10">

{/* ── Top Bar ── */}
<div className="flex items-center justify-between px-5 pt-12 pb-3">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-xl shadow-md">
      🦥
    </div>
    <div>
      <h1 className="text-[17px] font-bold text-gray-800 leading-none">Pick A Cat.</h1>
      <p className="text-[10px] text-gray-400 mt-0.5">{dateStr}</p>
    </div>
  </div>
</div>

        {/* ── Hero Card ── */}
        <div className="mx-4 mb-4 rounded-3xl bg-gradient-to-br from-orange-400 via-rose-400 to-fuchsia-500 p-5 relative overflow-hidden shadow-lg">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
          <div className="absolute -bottom-6 left-8 w-20 h-20 bg-white/8 rounded-full" />
          <span className="absolute top-4 right-5 text-4xl drop-shadow-md select-none">🐾🦥</span>

          <p className="text-white/80 text-[11px] mb-0.5">ยอดขายวันนี้</p>
          <p className="text-white text-[34px] font-bold leading-none tracking-tight">
            <span className="text-lg mr-0.5">฿</span>
            {todaySales.toLocaleString()}
            <span className="text-base font-semibold">.00</span>
          </p>

          <div className="inline-flex items-center gap-1 mt-2 bg-white/20 rounded-full px-3 py-1 text-white text-[11px]">
            <span>🧾</span>
            <span>{todayBillCount} บิลวันนี้</span>
          </div>

          <Link href="/pos"
            className="mt-3 flex items-center justify-between bg-white/20 border border-white/40 rounded-2xl px-4 py-2.5 active:scale-95 transition-transform">
            <span className="text-white text-[13px] font-semibold">🛒 เริ่มรายของ · POS</span>
            <span className="text-white text-lg">→</span>
          </Link>
        </div>

        {/* ── Alert Cards ── */}
        <div className="mx-4 mb-4 flex flex-col gap-3">

          {/* วันลงของ + วันส่งของ */}
          <Link href="/finance" className="bg-white rounded-2xl px-4 py-3.5 flex gap-3 shadow-sm active:scale-[0.98] transition-transform">
            <div className="flex-1 border-r border-gray-100 pr-3">
              <p className="text-[10px] text-gray-400 mb-0.5">📦 วันลงของ</p>
              <p className="text-[13px] font-bold text-gray-800">{formatThaiDate(stockInDate)}</p>
            </div>
            <div className="flex-1 pl-1">
              <p className="text-[10px] text-gray-400 mb-0.5">🛵 วันส่งของ</p>
              <p className="text-[13px] font-bold text-gray-800">{formatThaiDate(stockOutDate)}</p>
            </div>
          </Link>

          {/* ✅ รอจัดส่ง — นับทั้ง pending + packed */}
          <Link href="/delivery" className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform">
            <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center text-xl flex-shrink-0">🚚</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400">รอจัดส่ง</p>
              <p className="text-[16px] font-bold text-gray-800">{pendingDeliveries} ออเดอร์</p>
            </div>
            <span className="text-rose-400 text-[12px] font-semibold whitespace-nowrap">ก่อน 12.00 →</span>
          </Link>

          {/* ค้างชำระ */}
          <Link href="/orders?filter=pending" className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform">
            <div className="w-11 h-11 rounded-xl bg-yellow-100 flex items-center justify-center text-xl flex-shrink-0">₿</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400">ค้างชำระ</p>
              <p className="text-[16px] font-bold text-gray-800">฿{unpaidTotal.toLocaleString()}</p>
            </div>
            <span className="text-amber-500 text-[12px] font-semibold whitespace-nowrap">{unpaidCount} ราย →</span>
          </Link>

        </div>

        {/* ── Menu Grid ── */}
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-bold text-gray-700">🗂️ เมนูหลัก</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {menus.map((m) => (
              <Link key={m.href} href={m.href}
                className={`bg-gradient-to-br ${m.bg} rounded-2xl p-4 flex flex-col items-start shadow-sm active:scale-95 transition-transform`}>
                <span className="text-2xl mb-2 drop-shadow-sm">{m.emoji}</span>
                <span className="text-white text-[12px] font-bold leading-tight">{m.label}</span>
                <span className="text-white/70 text-[10px] mt-0.5">{m.sub}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </main>
  )
}