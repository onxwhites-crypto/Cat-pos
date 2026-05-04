'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [todaySales, setTodaySales] = useState(0)
  const [pendingDeliveries, setPendingDeliveries] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [unpaidCount, setUnpaidCount] = useState(0)
  const [unpaidTotal, setUnpaidTotal] = useState(0)

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    const today = new Date().toISOString().split('T')[0]

    // ยอดขายวันนี้
    const { data: sales } = await supabase
      .from('orders')
      .select('total')
      .gte('order_date', today)
      .eq('payment_status', 'paid')
    setTodaySales(sales?.reduce((sum, o) => sum + o.total, 0) || 0)

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
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800">🐱Mini-pos</h1>
<p className="text-gray-400 text-xs mt-1">
  {new Date().toLocaleDateString('th-TH', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}
</p>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">💵 ยอดขายวันนี้</div>
            <div className="text-xl font-bold text-green-600">{todaySales.toLocaleString()}฿</div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">🛵 รอส่ง</div>
            <div className="text-xl font-bold text-orange-500">{pendingDeliveries} ออเดอร์</div>
          </div>

          <div className={`rounded-2xl p-4 shadow-sm ${lowStockCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
            <div className="text-xs text-gray-500 mb-1">📦 สินค้าใกล้หมด</div>
            <div className={`text-xl font-bold ${lowStockCount > 0 ? 'text-red-500' : 'text-gray-800'}`}>
              {lowStockCount} รายการ {lowStockCount > 0 ? '⚠️' : ''}
            </div>
          </div>

          <div className={`rounded-2xl p-4 shadow-sm ${unpaidCount > 0 ? 'bg-yellow-50' : 'bg-white'}`}>
            <div className="text-xs text-gray-500 mb-1">⚠️ ค้างชำระ</div>
            <div className={`text-xl font-bold ${unpaidCount > 0 ? 'text-yellow-600' : 'text-gray-800'}`}>
              {unpaidCount} ราย
            </div>
            {unpaidTotal > 0 && (
              <div className="text-xs text-yellow-500">{unpaidTotal.toLocaleString()}฿</div>
            )}
          </div>
        </div>

        {/* Menu Grid */}
        <div className="grid grid-cols-2 gap-3">
          <a href="/pos" className="bg-orange-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
            <div className="text-3xl mb-2">🛒</div>
            <div className="font-bold">ขายของ</div>
            <div className="text-xs opacity-80">POS</div>
          </a>

          <a href="/post" className="bg-blue-400 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
  <div className="text-3xl mb-2">📢</div>
  <div className="font-bold">โพสขาย</div>
  <div className="text-xs opacity-80">Facebook</div>
</a>

        <a href="/receiving" className="bg-indigo-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
          <div className="text-3xl mb-2">📦</div>
          <div className="font-bold">สั่งออเดอร์</div>
          <div className="text-xs opacity-80">Order</div>
        </a>

        <a href="/parcels" className="bg-teal-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
          <div className="text-3xl mb-2">📥</div>
          <div className="font-bold">รับพัสดุ</div>
          <div className="text-xs opacity-80">Parcels</div>
        </a>

          <a href="/stock" className="bg-blue-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
            <div className="text-3xl mb-2">📦</div>
            <div className="font-bold">คลังสินค้า</div>
            <div className="text-xs opacity-80">Stock</div>
          </a>

        <a href="/orders" className="bg-cyan-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
          <div className="text-3xl mb-2">📋</div>
          <div className="font-bold">ประวัติการขาย</div>
          <div className="text-xs opacity-80">Orders</div>
        </a>

          <a href="/delivery" className="bg-green-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
            <div className="text-3xl mb-2">🛵</div>
            <div className="font-bold">เดลิเวอรี่</div>
            <div className="text-xs opacity-80">Delivery</div>
          </a>

          <a href="/customers" className="bg-purple-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
            <div className="text-3xl mb-2">👤</div>
            <div className="font-bold">ลูกค้า</div>
            <div className="text-xs opacity-80">Customers</div>
          </a>

          <a href="/finance" className="bg-yellow-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
            <div className="text-3xl mb-2">💰</div>
            <div className="font-bold">การเงิน</div>
            <div className="text-xs opacity-80">Finance</div>
          </a>

          <a href="/promotions" className="bg-pink-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
            <div className="text-3xl mb-2">🎁</div>
            <div className="font-bold">โปรโมชั่น</div>
            <div className="text-xs opacity-80">Promotions</div>
          </a>

          <a href="/settings" className="bg-gray-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
            <div className="text-3xl mb-2">⚙️</div>
            <div className="font-bold">ตั้งค่า</div>
            <div className="text-xs opacity-80">Settings</div>
          </a>

          <a href="/debts" className="bg-red-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
  <div className="text-3xl mb-2">💳</div>
  <div className="font-bold">หนี้สิน</div>
  <div className="text-xs opacity-80">Debts</div>
</a>

<a href="/import" className="bg-blue-500 text-white rounded-2xl p-5 shadow-sm active:scale-95 transition-transform">
  <div className="text-3xl mb-2">📥</div>
  <div className="font-bold">Import / Export</div>
  <div className="text-xs opacity-80">สินค้า</div>
</a>

        </div>

      </div>
    </main>
  )
}