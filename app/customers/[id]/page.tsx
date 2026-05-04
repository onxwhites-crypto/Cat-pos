'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

type Customer = {
  id: string
  name: string
  phone: string
  location_type: string
  address: string
  note: string
  zones: { name: string } | null
}

type OrderItem = {
  id: string
  quantity: number
  unit_price: number
  total_price: number
  products: { name: string; unit: string; avg_cost: number } | null
}

type Order = {
  id: string
  order_date: string
  total: number
  payment_status: string
  order_items: OrderItem[]
}

export default function CustomerDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const [{ data: c }, { data: o }] = await Promise.all([
      supabase.from('customers').select('*, zones(name)').eq('id', id).single(),
      supabase.from('orders').select('*, order_items(id, quantity, unit_price, total_price, products(name, unit, avg_cost))').eq('customer_id', id)
    .order('order_date', { ascending: false }),
    ])
    setCustomer(c)
    setOrders(o || [])
    setLoading(false)
  }

const totalOrders = orders.length
const totalAmount = orders.filter(o => o.payment_status === 'paid')
  .reduce((sum, o) => sum + o.total, 0)
const unpaidAmount = orders.filter(o => o.payment_status === 'pending')
  .reduce((sum, o) => sum + o.total, 0)
const unpaidCount = orders.filter(o => o.payment_status === 'pending').length

// คำนวณทุน/กำไรรวม (เฉพาะที่จ่ายแล้ว)
const totalCost = orders
  .filter(o => o.payment_status === 'paid')
  .reduce((sum, o) =>
    sum + o.order_items.reduce((s, i) =>
      s + (i.products?.avg_cost || 0) * i.quantity, 0), 0)
const totalProfit = totalAmount - totalCost

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">กำลังโหลด...</p>
    </main>
  )

  if (!customer) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">ไม่พบลูกค้าค่ะ</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">โปรไฟล์ลูกค้า</h1>
        </div>

        {/* Customer Info */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <h2 className="text-xl font-bold text-gray-800">{customer.name}</h2>
          {customer.phone && (
            <div className="text-sm text-gray-500 mt-1">📞 {customer.phone}</div>
          )}
          {customer.address && (
            <div className="text-sm text-gray-500 mt-1">
              🏠 {customer.location_type} {customer.address}
            </div>
          )}
          {customer.zones && (
            <span className="inline-block text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full mt-2">
              📍 {customer.zones.name}
            </span>
          )}
          {customer.note && (
            <div className="bg-yellow-50 rounded-xl p-2 mt-3">
              <div className="text-xs text-yellow-700 font-bold mb-1">หมายเหตุ</div>
              <div className="text-sm text-gray-700">{customer.note}</div>
            </div>
          )}
        </div>

{/* Stats */}
<div className="grid grid-cols-3 gap-2 mb-3">
  <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
    <div className="text-xs text-gray-500">ซื้อทั้งหมด</div>
    <div className="text-lg font-bold text-gray-800">{totalOrders}</div>
    <div className="text-xs text-gray-400">ครั้ง</div>
  </div>
  <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
    <div className="text-xs text-gray-500">ยอดรวม</div>
    <div className="text-lg font-bold text-green-500">{totalAmount.toLocaleString()}</div>
    <div className="text-xs text-gray-400">฿</div>
  </div>
  <div className={`rounded-2xl p-3 shadow-sm text-center ${
    unpaidAmount > 0 ? 'bg-yellow-50' : 'bg-white'
  }`}>
    <div className="text-xs text-gray-500">ค้างชำระ</div>
    <div className={`text-lg font-bold ${unpaidAmount > 0 ? 'text-yellow-600' : 'text-gray-800'}`}>
      {unpaidAmount.toLocaleString()}
    </div>
    <div className="text-xs text-gray-400">{unpaidCount} บิล</div>
  </div>
</div>

{/* Profit Card */}
<div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
  <h3 className="font-bold text-gray-700 mb-3">💰 สรุปทุน-กำไร (เฉพาะจ่ายแล้ว)</h3>
  <div className="space-y-2">
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">ยอดขายรวม</span>
      <span className="font-medium">{totalAmount.toLocaleString()}฿</span>
    </div>
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">ทุนรวม</span>
      <span className="font-medium">{totalCost.toFixed(2)}฿</span>
    </div>
    <div className="flex justify-between font-bold pt-2 border-t border-gray-100">
      <span className="text-gray-700">กำไรสุทธิ</span>
      <span className={totalProfit >= 0 ? 'text-green-600' : 'text-red-500'}>
        {totalProfit.toFixed(2)}฿
      </span>
    </div>
  </div>
</div>

{/* Order History */}
<div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
  <h3 className="font-bold text-gray-700 mb-3">ประวัติการซื้อ</h3>
  {orders.length === 0 ? (
    <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีประวัติการซื้อค่ะ</p>
  ) : (
    <div className="space-y-2">
      {orders.map(order => (
        <button key={order.id} onClick={() => setSelectedOrder(order)}
          className="w-full flex justify-between items-center py-2 border-b border-gray-100 last:border-0 active:bg-gray-50">
          <div className="text-left">
            <div className="text-sm font-medium">
              {new Date(order.order_date).toLocaleDateString('th-TH', {
                day: 'numeric', month: 'short', year: '2-digit'
              })}
            </div>
            <div className="text-xs text-gray-400">
              {order.order_items.length} รายการ
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-sm">{order.total.toLocaleString()}฿</div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              order.payment_status === 'paid'
                ? 'bg-green-100 text-green-600'
                : 'bg-yellow-100 text-yellow-600'
            }`}>
              {order.payment_status === 'paid' ? '✅' : '⏳'}
            </span>
          </div>
        </button>
      ))}
    </div>
  )}
</div>

{/* Order Detail Modal */}
{selectedOrder && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
    <div className="bg-white w-full rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg">รายละเอียดบิล</h3>
        <button onClick={() => setSelectedOrder(null)} className="text-gray-400 text-xl">✕</button>
      </div>

      <div className="text-sm text-gray-500 mb-3">
        📅 {new Date(selectedOrder.order_date).toLocaleString('th-TH')}
      </div>

      <div className="space-y-2 mb-3">
        {selectedOrder.order_items.map(item => (
          <div key={item.id} className="flex justify-between items-start py-2 border-b border-gray-100">
            <div className="flex-1">
              <div className="text-sm font-medium">{item.products?.name || 'สินค้าถูกลบ'}</div>
              <div className="text-xs text-gray-400">
                {item.quantity} {item.products?.unit || 'ชิ้น'} × {item.unit_price}฿
              </div>
            </div>
            <div className="text-sm font-bold ml-2">
              {item.total_price.toLocaleString()}฿
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 rounded-xl p-3 flex justify-between items-center">
        <span className="font-bold">รวมทั้งสิ้น</span>
        <span className="font-bold text-lg text-orange-500">
          {selectedOrder.total.toLocaleString()}฿
        </span>
      </div>

      <div className="text-center mt-3">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
          selectedOrder.payment_status === 'paid'
            ? 'bg-green-100 text-green-600'
            : 'bg-yellow-100 text-yellow-600'
        }`}>
          {selectedOrder.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
        </span>
      </div>
    </div>
  </div>
)}

      </div>
    </main>
  )
}