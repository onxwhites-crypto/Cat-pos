'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function getWeekDays() {
  const days = []
  const today = new Date()
  for (let i = -1; i < 6; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d)
  }
  return days
}

function toYMD(date: Date) {
  return date.toISOString().split('T')[0]
}

function formatThaiDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function formatThaiTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

export default function OrderHistoryPopup({
  show, onClose, onSelectOrder,
}: {
  show: boolean
  onClose: () => void
  onSelectOrder: (order: any) => void
}) {
  const [tab, setTab] = useState<'normal' | 'cancelled'>('normal')
  const [orders, setOrders] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [selectedDate, setSelectedDate] = useState(toYMD(new Date()))
  const [loading, setLoading] = useState(false)

  const weekDays = getWeekDays()

  useEffect(() => {
    if (show) fetchOrders()
  }, [show, tab, selectedDate])

  async function fetchOrders() {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('*, order_items(id, quantity, unit_price, product_id, products(name, unit)), customers(name)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (tab === 'cancelled') {
      query = query.eq('status', 'cancelled')
    } else {
      query = query.not('status', 'eq', 'cancelled')
    }

    if (selectedDate) {
      query = query.gte('created_at', selectedDate + 'T00:00:00').lte('created_at', selectedDate + 'T23:59:59')
    }

    const { data } = await query
    setOrders(data || [])
    setLoading(false)
  }

  async function handleCancel(order: any) {
    if (!confirm(`ยืนยันยกเลิกบิลของ ${order.customers?.name || 'ลูกค้าทั่วไป'}?`)) return
    try {
      await supabase.from('deliveries').delete().eq('order_id', order.id)
      if (order.order_type !== 'reservation') {
        for (const item of order.order_items || []) {
          const { data: product } = await supabase.from('products').select('stock_qty').eq('id', item.product_id).single()
          if (product) {
            await supabase.from('products').update({ stock_qty: product.stock_qty + item.quantity }).eq('id', item.product_id)
            await supabase.from('stock_movements').insert({
              product_id: item.product_id, type: 'IN',
              quantity: item.quantity, ref_type: 'cancel', ref_id: order.id,
            })
          }
        }
      }
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
      fetchOrders()
      alert('ยกเลิกบิลเรียบร้อยค่ะ')
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
  }

  const filtered = orders.filter(o =>
    !search || o.customers?.name?.toLowerCase().includes(search.toLowerCase())
  )

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={onClose}>
      <div
        className="bg-[#fff5f3] w-full rounded-t-3xl overflow-hidden flex flex-col"
        style={{ height: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex justify-between items-center px-4 py-2 flex-shrink-0">
          <h3 className="font-bold text-gray-800 text-lg">📋 ประวัติบิล</h3>
          <button onClick={onClose} className="text-gray-400 text-xl w-8 h-8 flex items-center justify-center">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-4 mb-3 flex-shrink-0">
          <button
            onClick={() => setTab('normal')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${tab === 'normal' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}
          >
            🧾 ใบเสร็จปกติ
          </button>
          <button
            onClick={() => setTab('cancelled')}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${tab === 'cancelled' ? 'bg-gray-500 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}
          >
            ❌ ที่ยกเลิก
          </button>
        </div>

        {/* Week calendar */}
        <div className="flex gap-2 px-4 mb-3 overflow-x-auto scrollbar-hide flex-shrink-0 pb-1">
            {weekDays.map((day, i) => {
            const ymd = toYMD(day)
            const isSelected = selectedDate === ymd
            const isYesterday = i === 0
            const isToday = i === 1
            const label = isToday ? 'วันนี้' : isYesterday ? 'เมื่อวาน' : day.toLocaleDateString('th-TH', { weekday: 'short' })
            return (
                <button
                key={ymd}
                onClick={() => setSelectedDate(ymd)}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all text-center min-w-[48px] ${isSelected ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-500 shadow-sm'}`}
                >
                <div>{label}</div>
                <div className={`text-[10px] font-bold ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                    {day.getDate()}/{day.getMonth() + 1}
                </div>
                </button>
            )
            })}
            <button
            onClick={() => setSelectedDate('')}
            className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all min-w-[48px] text-center ${selectedDate === '' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-500 shadow-sm'}`}
            >
            <div>ทั้งหมด</div>
            <div className="text-[10px]">·····</div>
            </button>
        </div>

        {/* Search */}
        <div className="px-4 mb-3 flex-shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white rounded-2xl pl-8 pr-4 py-2.5 text-sm shadow-sm outline-none placeholder-gray-300"
              placeholder="ค้นหาชื่อลูกค้า..."
            />
          </div>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-2">🧾</div>
              <p className="text-gray-400 text-sm">ไม่มีบิลค่ะ</p>
            </div>
          ) : filtered.map(o => (
            <div
              key={o.id}
              className="bg-white rounded-2xl p-3.5 shadow-sm active:scale-[0.98] transition-transform"
              onClick={() => onSelectOrder(o)}
            >
              {/* Row 1: ชื่อ + ยอด */}
              <div className="flex justify-between items-start mb-1">
                <p className="font-bold text-sm text-gray-800">
                  {o.customers?.name || 'ลูกค้าทั่วไป'}
                  {o.order_type === 'reservation' && <span className="ml-1 text-purple-400 text-xs">🏪</span>}
                </p>
                <p className="font-extrabold text-rose-500 text-sm ml-2 flex-shrink-0">
                  {o.total?.toLocaleString()}฿
                </p>
              </div>

              {/* Row 2: วันที่ เวลา จำนวน + สถานะ */}
              <div className="flex justify-between items-center">
                <p className="text-xs text-gray-400">
                  {formatThaiDate(o.created_at)} {formatThaiTime(o.created_at)} · {o.order_items?.length || 0} รายการ
                </p>
                <span className={`text-xs font-semibold flex-shrink-0 ml-2 ${
                  tab === 'cancelled' ? 'text-gray-400' :
                  o.payment_status === 'paid' ? 'text-teal-500' : 'text-amber-500'
                }`}>
                  {tab === 'cancelled' ? '❌ ยกเลิก' : o.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                </span>
              </div>

              {/* ปุ่ม — เฉพาะ normal tab */}
                {tab === 'normal' && (
                <div className="flex gap-2 mt-2.5" onClick={e => e.stopPropagation()}>
                    <button
                    onClick={() => onSelectOrder(o)}
                    className="bg-gray-50 text-gray-600 px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
                    >
                    🔍 ดูบิล
                    </button>
                    <button
                    onClick={() => handleCancel(o)}
                    className="bg-red-50 text-red-400 px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
                    >
                    ❌ ยกเลิก
                    </button>
                </div>
                )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}