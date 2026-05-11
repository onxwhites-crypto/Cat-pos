'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Order = {
  id: string
  order_date: string
  subtotal: number
  discount: number
  total: number
  payment_method: string
  payment_status: string
  order_type: string | null
  paid_at: string | null
  note: string
  customers: { name: string; phone: string } | null
  order_items: {
    id: string
    quantity: number
    unit_price: number
    total_price: number
    products: { name: string; unit: string; image_url: string | null; avg_cost: number } | null
  }[]
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending' | 'reservation'>('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchName, setSearchName] = useState('')

  useEffect(() => { fetchOrders() }, [filter, dateFrom, dateTo])

  async function fetchOrders() {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select(`
        *,
        customers(name, phone),
        order_items(id, quantity, unit_price, total_price, products(name, unit, image_url, avg_cost))
      `)
      .order('order_date', { ascending: false })

    if (filter === 'paid') query = query.eq('payment_status', 'paid')
    else if (filter === 'pending') query = query.eq('payment_status', 'pending')
    else if (filter === 'reservation') query = query.eq('order_type', 'reservation')

    if (dateFrom) query = query.gte('order_date', dateFrom)
    if (dateTo) query = query.lte('order_date', dateTo + 'T23:59:59')

    const { data } = await query
    setOrders(data || [])
    setLoading(false)
  }

  async function markAsPaid(id: string) {
    if (!confirm('ยืนยันว่าได้รับเงินแล้วใช่ไหมคะ?')) return
    await supabase.from('orders').update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', id)
    fetchOrders()
    if (selectedOrder?.id === id) setSelectedOrder(null)
  }

  async function deleteOrder(id: string) {
    if (!confirm('ลบบิลนี้? (ไม่สามารถกู้คืนได้)')) return
    try {
      const { data: items } = await supabase.from('order_items').select('product_id, quantity').eq('order_id', id)
      if (items && items.length > 0) {
        for (const item of items) {
          const { data: p } = await supabase.from('products').select('stock_qty').eq('id', item.product_id).single()
          if (p) {
            await supabase.from('products').update({ stock_qty: p.stock_qty + item.quantity }).eq('id', item.product_id)
          }
        }
      }
      await supabase.from('stock_movements').delete().eq('ref_id', id).eq('ref_type', 'order')
      await supabase.from('order_items').delete().eq('order_id', id)
      await supabase.from('deliveries').delete().eq('order_id', id)
      await supabase.from('orders').delete().eq('id', id)
      setSelectedOrder(null)
      fetchOrders()
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
  }

  const totalSales = orders.filter(o => o.payment_status === 'paid').reduce((sum, o) => sum + o.total, 0)
  const totalPending = orders.filter(o => o.payment_status === 'pending').reduce((sum, o) => sum + o.total, 0)
  const totalReservation = orders.filter(o => o.order_type === 'reservation').length

  return (
    <main className="min-h-screen bg-[#fff5f3]">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')}
            className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform">
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-800">📋 ประวัติการขาย</h1>
        </div>
        
{/* Search */}
<div className="relative">
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">🔍</span>
  <input
    value={searchName}
    onChange={e => setSearchName(e.target.value)}
    className="w-full bg-white rounded-2xl pl-8 pr-4 py-2.5 text-sm shadow-sm outline-none placeholder-gray-300"
    placeholder="ค้นหาชื่อลูกค้า..."
  />
</div>

{/* Date Filter */}

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {[
            { key: 'all', label: 'ทั้งหมด' },
            { key: 'paid', label: '✅ จ่ายแล้ว' },
            { key: 'pending', label: '⏳ ค้างชำระ' },
            { key: 'reservation', label: '🏪 ฝากของ' },
          ].map(btn => (
            <button key={btn.key} onClick={() => setFilter(btn.key as any)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                filter === btn.key
                  ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm'
                  : 'bg-white text-gray-400 shadow-sm'
              }`}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-8 space-y-3 pt-2">

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-400">ขายแล้ว</p>
            <p className="text-base font-bold text-teal-500">{totalSales.toLocaleString()}฿</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-400">ค้างชำระ</p>
            <p className="text-base font-bold text-amber-500">{totalPending.toLocaleString()}฿</p>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <p className="text-xs text-gray-400">ฝากของ</p>
            <p className="text-base font-bold text-purple-500">{totalReservation} บิล</p>
          </div>
        </div>

        {/* Date Filter */}
        <div className="bg-white rounded-2xl p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400">ตั้งแต่</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none mt-1" />
            </div>
            <div>
              <label className="text-xs text-gray-400">ถึง</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none mt-1" />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-gray-400 mt-2 active:scale-95 transition-transform">
              ✕ ล้างวันที่
            </button>
          )}
        </div>

        {/* Orders List */}
        {loading ? (
          <p className="text-center text-gray-400 py-8 text-sm">กำลังโหลด...</p>
        ) : orders.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-sm">ยังไม่มีบิลค่ะ</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders
      .filter(o => !searchName || o.customers?.name?.toLowerCase().includes(searchName.toLowerCase()))
      .map(order => (
              <button key={order.id} onClick={() => setSelectedOrder(order)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-[0.98] transition-transform">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 truncate">
                      {order.customers?.name || 'ลูกค้าทั่วไป'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(order.order_date).toLocaleString('th-TH', {
                        day: 'numeric', month: 'short', year: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                      {' · '}{order.order_items.length} รายการ
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                    {/* badges */}
                    <div className="flex gap-1 flex-wrap justify-end">
                      {order.order_type === 'reservation' && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">
                          🏪 ฝากของ
                        </span>
                      )}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        order.payment_status === 'paid'
                          ? 'bg-teal-100 text-teal-600'
                          : 'bg-amber-100 text-amber-600'
                      }`}>
                        {order.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                      </span>
                    </div>
                    <p className="text-lg font-extrabold text-rose-500">
                      {order.total.toLocaleString()}฿
                    </p>
                  </div>
                </div>
                {order.payment_method && (
                  <p className="text-xs text-gray-400 mt-1">
                    {order.payment_method === 'cash' ? '💵 เงินสด' : '💳 โอน'}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══ ORDER DETAIL MODAL ══ */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">รายละเอียดบิล</h3>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 text-xl">✕</button>
            </div>

            {/* Customer + Status */}
            <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-gray-800">{selectedOrder.customers?.name || 'ลูกค้าทั่วไป'}</p>
                  {selectedOrder.customers?.phone && (
                    <p className="text-xs text-gray-400">{selectedOrder.customers.phone}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(selectedOrder.order_date).toLocaleString('th-TH')}
                  </p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {selectedOrder.order_type === 'reservation' && (
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-100 text-purple-600">
                      🏪 ฝากของ
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    selectedOrder.payment_status === 'paid'
                      ? 'bg-teal-100 text-teal-600'
                      : 'bg-amber-100 text-amber-600'
                  }`}>
                    {selectedOrder.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                  </span>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="mb-3">
              <p className="font-bold text-sm text-gray-700 mb-2">รายการสินค้า</p>
              <div className="space-y-2">
                {selectedOrder.order_items.map(item => {
                  const cost = (item.products?.avg_cost || 0) * item.quantity
                  const profit = item.total_price - cost
                  return (
                    <div key={item.id} className="bg-white rounded-2xl p-3 shadow-sm">
                      <div className="flex gap-3 items-start">
                        <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                          {item.products?.image_url ? (
                            <img src={item.products.image_url} className="w-full h-full object-contain p-1" />
                          ) : <span className="text-xl">🐱</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 line-clamp-1">
                            {item.products?.name || 'สินค้าถูกลบ'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.quantity} × {item.unit_price}฿ = {item.total_price.toLocaleString()}฿
                          </p>
                          <div className="flex gap-3 text-xs mt-1">
                            <span className="text-gray-400">ทุน {cost.toFixed(2)}฿</span>
                            <span className={profit >= 0 ? 'text-teal-500 font-bold' : 'text-red-500 font-bold'}>
                              กำไร {profit.toFixed(2)}฿
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Summary */}
            {(() => {
              const totalCost = selectedOrder.order_items.reduce((sum, i) =>
                sum + (i.products?.avg_cost || 0) * i.quantity, 0)
              const totalProfit = selectedOrder.total - totalCost
              return (
                <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">ราคารวม</span>
                    <span className="text-gray-700">{selectedOrder.subtotal.toLocaleString()}฿</span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">ส่วนลด</span>
                      <span className="text-teal-500">-{selectedOrder.discount.toLocaleString()}฿</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-50">
                    <span className="text-gray-800">รวมทั้งสิ้น</span>
                    <span className="text-rose-500">{selectedOrder.total.toLocaleString()}฿</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-50">
                    <span className="text-gray-400">ต้นทุนรวม</span>
                    <span className="text-gray-600">{totalCost.toFixed(2)}฿</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-gray-700">กำไรสุทธิ</span>
                    <span className={totalProfit >= 0 ? 'text-teal-500' : 'text-red-500'}>
                      {totalProfit.toFixed(2)}฿
                    </span>
                  </div>
                  {selectedOrder.payment_method && (
                    <p className="text-xs text-gray-400 text-right pt-1">
                      วิธีชำระ: {selectedOrder.payment_method === 'cash' ? '💵 เงินสด' : '💳 โอน'}
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Note */}
            {selectedOrder.note && (
              <div className="bg-amber-50 rounded-2xl p-3 mb-3">
                <p className="text-xs text-amber-700 font-bold mb-1">หมายเหตุ</p>
                <p className="text-sm text-gray-700">{selectedOrder.note}</p>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              {selectedOrder.payment_status === 'pending' && (
                <button onClick={() => markAsPaid(selectedOrder.id)}
                  className="w-full bg-teal-500 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform">
                  ✅ บันทึกว่าได้รับเงินแล้ว
                </button>
              )}
              <button onClick={() => deleteOrder(selectedOrder.id)}
                className="w-full bg-red-50 text-red-400 font-bold py-3.5 rounded-2xl active:scale-95 transition-transform">
                🗑️ ลบบิลนี้
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}