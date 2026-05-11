'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function Dashboard() {
  const [todaySales, setTodaySales] = useState(0)
  const [todayBillCount, setTodayBillCount] = useState(0)
  const [pendingDeliveries, setPendingDeliveries] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [unpaidTotal, setUnpaidTotal] = useState(0)
  const [stockInDate, setStockInDate] = useState<string | null>(null)
  const [stockOutDate, setStockOutDate] = useState<string | null>(null)
  const [dateStr, setDateStr] = useState('')

  useEffect(() => {
    setDateStr(
      new Date().toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    )
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    const today = new Date().toISOString().split('T')[0]

    // ยอดขายวันนี้ + จำนวนบิล
    const { data: sales } = await supabase
      .from('orders')
      .select('total')
      .gte('order_date', today)
      .eq('payment_status', 'paid')
    setTodaySales(sales?.reduce((sum, o) => sum + o.total, 0) || 0)
    setTodayBillCount(sales?.length || 0)

    // ออเดอร์รอส่ง
    const { count: deliveries } = await supabase
      .from('deliveries')
      .select('*', { count: 'exact' })
      .eq('status', 'pending')
    setPendingDeliveries(deliveries || 0)

    // สินค้าใกล้หมด
    const { data: products } = await supabase
      .from('products')
      .select('stock_qty, low_stock_alert')
      .eq('is_active', true)
    const low = products?.filter(p => p.stock_qty <= p.low_stock_alert) || []
    setLowStockCount(low.length)

    // ลูกค้าค้างชำระ
    const { data: unpaid } = await supabase
      .from('orders')
      .select('total')
      .eq('payment_status', 'pending')
    setUnpaidCount(unpaid?.length || 0)
    setUnpaidTotal(unpaid?.reduce((sum, o) => sum + o.total, 0) || 0)

    // วันที่ลงของ + วันที่ส่งของ (จากหน้าการเงิน)
    const { data: financeData } = await supabase
      .from('finance')
      .select('stock_in_date, stock_out_date')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (financeData) {
      setStockInDate(financeData.stock_in_date)
      setStockOutDate(financeData.stock_out_date)
    }
  }

  function formatThaiDate(dateStr: string | null) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric'
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
              🐱
            </div>
            <div>
              <h1 className="text-[17px] font-bold text-gray-800 leading-none">Mini-pos</h1>
              <p className="text-[10px] text-gray-400 mt-0.5">{dateStr}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-base active:scale-95 transition-transform">
              🔍
            </button>
            <button className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-base relative active:scale-95 transition-transform">
              🔔
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-400 rounded-full border-2 border-[#fff5f3]" />
            </button>
          </div>
        </div>

        {/* ── Hero Card ── */}
        <div className="mx-4 mb-4 rounded-3xl bg-gradient-to-br from-orange-400 via-rose-400 to-fuchsia-500 p-5 relative overflow-hidden shadow-lg">
          {/* decorative circles */}
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
          <div className="absolute -bottom-6 left-8 w-20 h-20 bg-white/8 rounded-full" />

          {/* cat mascot */}
          <span className="absolute top-4 right-5 text-4xl drop-shadow-md select-none">🐱</span>

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

          {/* POS Button */}
          <Link
            href="/pos"
            className="mt-3 flex items-center justify-between bg-white/20 border border-white/40 rounded-2xl px-4 py-2.5 active:scale-95 transition-transform"
          >
            <span className="text-white text-[13px] font-semibold">🛒 เริ่มรายของ · POS</span>
            <span className="text-white text-lg">→</span>
          </Link>
        </div>

        {/* ── Alert Cards ── */}
        <div className="mx-4 mb-4 flex flex-col gap-3">

          {/* รอจัดส่ง */}
          <Link href="/delivery" className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform">
            <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center text-xl flex-shrink-0">
              🚚
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400">รอจัดส่ง</p>
              <p className="text-[16px] font-bold text-gray-800">{pendingDeliveries} ออเดอร์</p>
            </div>
            <span className="text-rose-400 text-[12px] font-semibold whitespace-nowrap">ก่อน 12.00 →</span>
          </Link>

          {/* ค้างชำระ */}
          <Link href="/debts" className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform">
            <div className="w-11 h-11 rounded-xl bg-yellow-100 flex items-center justify-center text-xl flex-shrink-0">
              ₿
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400">ค้างชำระ</p>
              <p className="text-[16px] font-bold text-gray-800">฿{unpaidTotal.toLocaleString()}</p>
            </div>
            <span className="text-amber-500 text-[12px] font-semibold whitespace-nowrap">{unpaidCount} ราย →</span>
          </Link>

          {/* วันที่ลงของ + วันที่ส่งของ */}
          <div className="bg-white rounded-2xl px-4 py-3.5 flex gap-3 shadow-sm">
            <div className="flex-1 border-r border-gray-100 pr-3">
              <p className="text-[10px] text-gray-400 mb-0.5">📅 วันที่ลงของ</p>
              <p className="text-[13px] font-bold text-gray-800">{formatThaiDate(stockInDate)}</p>
            </div>
            <div className="flex-1 pl-1">
              <p className="text-[10px] text-gray-400 mb-0.5">🚀 วันที่ส่งของ</p>
              <p className="text-[13px] font-bold text-gray-800">{formatThaiDate(stockOutDate)}</p>
            </div>
          </div>

        </div>

        {/* ── Menu Grid 13 items ── */}
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-bold text-gray-700">🗂️ เมนูหลัก</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {menus.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className={`bg-gradient-to-br ${m.bg} rounded-2xl p-4 flex flex-col items-start shadow-sm active:scale-95 transition-transform`}
              >
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