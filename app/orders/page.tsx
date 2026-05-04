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
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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

    if (filter !== 'all') query = query.eq('payment_status', filter)
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
    if (selectedOrder?.id === id) {
      setSelectedOrder(null)
    }
  }

async function deleteOrder(id: string) {
  if (!confirm('ลบบิลนี้? (ไม่สามารถกู้คืนได้)')) return

  try {
    // คืน stock ก่อน
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', id)

    if (items && items.length > 0) {
      for (const item of items) {
        const { data: p } = await supabase
          .from('products')
          .select('stock_qty')
          .eq('id', item.product_id)
          .single()
        if (p) {
          await supabase.from('products').update({
            stock_qty: p.stock_qty + item.quantity
          }).eq('id', item.product_id)
        }
      }
    }

    // ลบตามลำดับ
    await supabase.from('stock_movements').delete().eq('ref_id', id).eq('ref_type', 'order')
    await supabase.from('order_items').delete().eq('order_id', id)
    await supabase.from('deliveries').delete().eq('order_id', id)
    await supabase.from('orders').delete().eq('id', id)

    setSelectedOrder(null)
    fetchOrders()
  } catch (e) {
    alert('เกิดข้อผิดพลาดค่ะ')
  }
}

  // สรุปยอด
  const totalSales = orders.filter(o => o.payment_status === 'paid').reduce((sum, o) => sum + o.total, 0)
  const totalPending = orders.filter(o => o.payment_status === 'pending').reduce((sum, o) => sum + o.total, 0)

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">📋 ประวัติการขาย</h1>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <div className="text-xs text-gray-500">ขายแล้ว</div>
            <div className="text-lg font-bold text-green-500">{totalSales.toLocaleString()}฿</div>
          </div>
          <div className="bg-white rounded-2xl p-3 shadow-sm">
            <div className="text-xs text-gray-500">ค้างชำระ</div>
            <div className="text-lg font-bold text-yellow-500">{totalPending.toLocaleString()}฿</div>
          </div>
        </div>

        {/* Date Filter */}
        <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">ตั้งแต่</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">ถึง</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-gray-500 mt-2">ล้างวันที่</button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => setFilter('all')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium ${
              filter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'
            }`}>
            ทั้งหมด
          </button>
          <button onClick={() => setFilter('paid')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium ${
              filter === 'paid' ? 'bg-green-500 text-white' : 'bg-white text-gray-600'
            }`}>
            ✅ จ่ายแล้ว
          </button>
          <button onClick={() => setFilter('pending')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium ${
              filter === 'pending' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'
            }`}>
            ⏳ ค้างชำระ
          </button>
        </div>

        {/* Orders List */}
        {loading ? (
          <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
        ) : orders.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">📋</div>
            <p>ยังไม่มีบิลค่ะ</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map(order => (
              <button key={order.id} onClick={() => setSelectedOrder(order)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <div className="font-medium text-gray-800">
                      {order.customers?.name || 'ลูกค้าทั่วไป'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(order.order_date).toLocaleString('th-TH', {
                        day: 'numeric', month: 'short', year: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    order.payment_status === 'paid'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    {order.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                  </span>
                </div>
                <div className="flex justify-between items-end mt-2">
                  <div className="text-xs text-gray-400">
                    {order.order_items.length} รายการ
                    {order.payment_method && ` · ${order.payment_method === 'cash' ? '💵 เงินสด' : '💳 โอน'}`}
                  </div>
                  <div className="text-lg font-bold text-orange-500">
                    {order.total.toLocaleString()}฿
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">รายละเอียดบิล</h3>
                <button onClick={() => setSelectedOrder(null)} className="text-gray-400 text-xl">✕</button>
              </div>

              {/* Customer + Status */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{selectedOrder.customers?.name || 'ลูกค้าทั่วไป'}</div>
                    {selectedOrder.customers?.phone && (
                      <div className="text-xs text-gray-400">{selectedOrder.customers.phone}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(selectedOrder.order_date).toLocaleString('th-TH')}
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    selectedOrder.payment_status === 'paid'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    {selectedOrder.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                  </span>
                </div>
              </div>

{/* Items */}
<div className="mb-3">
  <h4 className="font-bold text-sm text-gray-700 mb-2">รายการสินค้า</h4>
  <div className="space-y-2">
    {selectedOrder.order_items.map(item => {
      const cost = (item.products?.avg_cost || 0) * item.quantity
      const profit = item.total_price - cost
      return (
        <div key={item.id} className="bg-gray-50 rounded-xl p-2">
          <div className="flex gap-2 items-start">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
              {item.products?.image_url ? (
                <img src={item.products.image_url} className="w-full h-full object-contain p-1" />
              ) : (
                <span className="text-xl">🐱</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium line-clamp-1">
                {item.products?.name || 'สินค้าถูกลบ'}
              </div>
              <div className="text-xs text-gray-400">
                {item.quantity} × {item.unit_price}฿ = {item.total_price.toLocaleString()}฿
              </div>
              <div className="flex gap-3 text-xs mt-1">
                <span className="text-gray-500">ทุน {cost.toFixed(2)}฿</span>
                <span className={profit >= 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
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
    <div className="bg-gray-50 rounded-xl p-3 mb-3">
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">ราคารวม</span>
        <span>{selectedOrder.subtotal.toLocaleString()}฿</span>
      </div>
      {selectedOrder.discount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">ส่วนลด</span>
          <span className="text-green-500">-{selectedOrder.discount.toLocaleString()}฿</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t border-gray-200">
        <span>รวมทั้งสิ้น</span>
        <span className="text-orange-500">{selectedOrder.total.toLocaleString()}฿</span>
      </div>
      <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-200">
        <span className="text-gray-500">ต้นทุนรวม</span>
        <span>{totalCost.toFixed(2)}฿</span>
      </div>
      <div className="flex justify-between text-sm font-bold">
        <span className="text-gray-700">กำไรสุทธิ</span>
        <span className={totalProfit >= 0 ? 'text-green-600' : 'text-red-500'}>
          {totalProfit.toFixed(2)}฿
        </span>
      </div>
      {selectedOrder.payment_method && (
        <div className="text-xs text-gray-400 mt-2 text-right">
          วิธีชำระ: {selectedOrder.payment_method === 'cash' ? '💵 เงินสด' : '💳 โอน'}
        </div>
      )}
    </div>
  )
})()}

              {/* Note */}
              {selectedOrder.note && (
                <div className="bg-yellow-50 rounded-xl p-3 mb-3">
                  <div className="text-xs text-yellow-700 font-bold mb-1">หมายเหตุ</div>
                  <div className="text-sm text-gray-700">{selectedOrder.note}</div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                {selectedOrder.payment_status === 'pending' && (
                  <button onClick={() => markAsPaid(selectedOrder.id)}
                    className="w-full bg-green-500 text-white font-bold py-3 rounded-xl">
                    ✅ บันทึกว่าได้รับเงินแล้ว
                  </button>
                )}
                <button onClick={() => deleteOrder(selectedOrder.id)}
                  className="w-full bg-red-100 text-red-600 font-bold py-3 rounded-xl">
                  🗑️ ลบบิลนี้
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}