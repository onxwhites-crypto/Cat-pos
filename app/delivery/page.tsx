'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Zone = { id: string; name: string }

type Delivery = {
  id: string
  order_id: string
  zone_id: string
  scheduled_date: string
  bag_count: number
  status: string
  delivered_at: string | null
  note: string
  zones: { name: string } | null
  orders: {
    id: string
    total: number
    payment_status: string
    note: string
    order_type: string | null
    customers: {
      id: string
      name: string
      phone: string
      address: string
      location_type: string
    } | null
    order_items: {
      id: string
      quantity: number
      product_id: string
      products: { name: string; unit: string } | null
    }[]
  } | null
}

// ✅ ใหม่: type สำหรับ Reservation (ฝากของที่ยังไม่มีกำหนดส่ง)
type Reservation = {
  id: string
  total: number
  payment_status: string
  note: string | null
  order_type: string
  created_at: string
  customers: {
    id: string
    name: string
    phone: string
    address: string
    location_type: string
  } | null
  order_items: {
    id: string
    quantity: number
    product_id: string
    products: { name: string; unit: string } | null
  }[]
}

export default function DeliveryPage() {
  const router = useRouter()
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [filterZone, setFilterZone] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'packed' | 'delivered'>('pending')
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [allDeliveries, setAllDeliveries] = useState<{ zone_id: string; status: string }[]>([])
  const [packBagCount, setPackBagCount] = useState(0)
  const [editScheduledDate, setEditScheduledDate] = useState('')

  // ✅ ใหม่: Tab + Reservation
  const [activeTab, setActiveTab] = useState<'delivery' | 'reservation'>('delivery')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [reserveScheduledDate, setReserveScheduledDate] = useState('')
  const [reserveZoneId, setReserveZoneId] = useState('')
  const [reserveBagCount, setReserveBagCount] = useState(1)
  const [reserveCustomDate, setReserveCustomDate] = useState('')
  const [savingReserve, setSavingReserve] = useState(false)
  const [deliveryRounds, setDeliveryRounds] = useState<{ id: string; delivery_date: string; note: string | null }[]>([])

  useEffect(() => { fetchData() }, [filterDate, filterZone, filterStatus])

  async function fetchData() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    let query = supabase
      .from('deliveries')
      .select(`
        *,
        zones(name),
        orders(
          id, total, payment_status, note, order_type,
          customers(id, name, phone, address, location_type),
          order_items(id, quantity, product_id, products(name, unit))
        )
      `)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (filterDate) query = query.eq('scheduled_date', filterDate)
    if (filterZone) query = query.eq('zone_id', filterZone)
    if (filterStatus !== 'all') query = query.eq('status', filterStatus)

    const { data: d } = await query
    const { data: z } = await supabase.from('zones').select('*').order('sort_order')

    // ✅ ดึง reservation — ดึง order_ids ที่มี delivery แล้วก่อน แล้วค่อย exclude
    const { data: existingDeliveries } = await supabase
      .from('deliveries')
      .select('order_id')

    const alreadyScheduledIds: string[] = (existingDeliveries || [])
      .map((d: any) => d.order_id)
      .filter(Boolean)

    let resvQuery = supabase
      .from('orders')
      .select(`
        id, total, payment_status, note, order_type, created_at,
        customers(id, name, phone, address, location_type),
        order_items(id, quantity, product_id, products(name, unit))
      `)
      .eq('order_type', 'reservation')
      .order('created_at', { ascending: false })

    if (alreadyScheduledIds.length > 0) {
      resvQuery = resvQuery.not('id', 'in', `(${alreadyScheduledIds.join(',')})`)
    }

    const { data: resv } = await resvQuery

    // ✅ ดึงรอบลงของสำหรับ dropdown
    const { data: rounds } = await supabase
      .from('delivery_rounds')
      .select('*')
      .gte('delivery_date', today)
      .order('delivery_date', { ascending: true })

    setDeliveries(d || [])
    setZones(z || [])
    setReservations((resv as any) || [])
    setDeliveryRounds(rounds || [])
    setLoading(false)

    const { data: allD } = await supabase
      .from('deliveries')
      .select('zone_id, status')
      .eq('scheduled_date', filterDate)
    setAllDeliveries(allD || [])
  }

  // ✅ แก้: ตัด stock ตอน delivered
  async function markAsDelivered(delivery: Delivery) {
    await supabase.from('deliveries').update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    }).eq('id', delivery.id)

    // ✅ ตัด stock ตอนนี้เลย
    const items = delivery.orders?.order_items || []
    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('stock_qty')
        .eq('id', item.product_id)
        .single()
      if (product) {
        await supabase.from('products').update({
          stock_qty: product.stock_qty - item.quantity
        }).eq('id', item.product_id)
        await supabase.from('stock_movements').insert({
          product_id: item.product_id,
          type: 'OUT',
          quantity: item.quantity,
          ref_type: 'delivery',
          ref_id: delivery.id,
        })
      }
    }

    fetchData()
    setSelectedDelivery(null)
  }

  // ✅ แก้: คืน stock ตอนยกเลิกการส่ง (ถ้าเคย delivered แล้ว)
  async function markAsPending(delivery: Delivery) {
    const wasDelivered = delivery.status === 'delivered'

    await supabase.from('deliveries').update({
      status: 'pending',
      delivered_at: null,
    }).eq('id', delivery.id)

    // คืน stock ถ้าเคย delivered แล้ว
    if (wasDelivered) {
      const items = delivery.orders?.order_items || []
      for (const item of items) {
        const { data: product } = await supabase
          .from('products')
          .select('stock_qty')
          .eq('id', item.product_id)
          .single()
        if (product) {
          await supabase.from('products').update({
            stock_qty: product.stock_qty + item.quantity
          }).eq('id', item.product_id)
          await supabase.from('stock_movements').insert({
            product_id: item.product_id,
            type: 'IN',
            quantity: item.quantity,
            ref_type: 'delivery_cancel',
            ref_id: delivery.id,
          })
        }
      }
    }

    fetchData()
    setSelectedDelivery(null)
  }

  async function updateScheduledDate(id: string, date: string) {
    await supabase.from('deliveries').update({ scheduled_date: date }).eq('id', id)
    fetchData()
    setSelectedDelivery(prev => prev ? { ...prev, scheduled_date: date } : null)
  }

  async function markAsPaid(orderId: string) {
    await supabase.from('orders').update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', orderId)
    fetchData()
    setSelectedDelivery(prev => prev ? {
      ...prev,
      orders: prev.orders ? { ...prev.orders, payment_status: 'paid' } : null
    } : null)
  }

  async function markAsPacked(id: string, bagCount: number) {
    if (bagCount <= 0) { alert('กรุณากรอกจำนวนถุงค่ะ'); return }
    await supabase.from('deliveries').update({ status: 'packed', bag_count: bagCount }).eq('id', id)
    fetchData()
    setSelectedDelivery(null)
  }

  // ✅ ใหม่: นัดส่ง reservation → สร้าง delivery
  async function confirmReservationDelivery() {
    if (!selectedReservation || !reserveScheduledDate) {
      alert('กรุณาเลือกวันส่งค่ะ')
      return
    }
    setSavingReserve(true)
    try {
      await supabase.from('deliveries').insert({
        order_id: selectedReservation.id,
        zone_id: reserveZoneId || null,
        scheduled_date: reserveScheduledDate,
        bag_count: reserveBagCount,
        status: 'pending',
        note: selectedReservation.customers?.address || null,
      })
      setSelectedReservation(null)
      setReserveScheduledDate('')
      setReserveZoneId('')
      setReserveBagCount(1)
      setActiveTab('delivery')
      fetchData()
      alert('นัดส่งเรียบร้อยแล้วค่ะ! 📅')
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setSavingReserve(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const totalPending = deliveries.filter(d => d.status === 'pending').length
  const totalPacked = deliveries.filter(d => d.status === 'packed').length
  const totalDelivered = deliveries.filter(d => d.status === 'delivered').length
  const totalBags = deliveries.filter(d => d.status === 'packed').reduce((sum, d) => sum + d.bag_count, 0)
  const overdueCount = deliveries.filter(d => d.status === 'pending' && d.scheduled_date < today).length

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">🛵 เดลิเวอรี่</h1>
        </div>

        {/* ✅ Tab: ส่งของ / ฝากของ */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => setActiveTab('delivery')}
            className={`py-2.5 rounded-xl text-sm font-bold ${activeTab === 'delivery' ? 'bg-green-500 text-white' : 'bg-white text-gray-600'}`}>
            🛵 ส่งของ
          </button>
          <button onClick={() => setActiveTab('reservation')}
            className={`py-2.5 rounded-xl text-sm font-bold relative ${activeTab === 'reservation' ? 'bg-purple-500 text-white' : 'bg-white text-gray-600'}`}>
            🏪 ฝากของ
            {reservations.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {reservations.length}
              </span>
            )}
          </button>
        </div>

        {/* ========== TAB: ส่งของ ========== */}
        {activeTab === 'delivery' && (
          <>
            {overdueCount > 0 && filterDate === today && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-3">
                <div className="text-sm font-bold text-red-600">⚠️ มีออเดอร์ค้างส่ง</div>
                <div className="text-xs text-red-500 mt-1">มี {overdueCount} ออเดอร์เลยกำหนดส่งแล้วค่ะ</div>
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-500">รอแพ๊ค</div>
                <div className="text-lg font-bold text-yellow-500">{totalPending}</div>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-500">แพ๊คแล้ว</div>
                <div className="text-lg font-bold text-orange-500">{totalPacked}</div>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-500">ส่งแล้ว</div>
                <div className="text-lg font-bold text-green-500">{totalDelivered}</div>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
                <div className="text-xs text-gray-500">รวมถุง</div>
                <div className="text-lg font-bold text-blue-500">{totalBags}</div>
              </div>
            </div>

            {/* Date Filter */}
            <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
              <label className="text-xs text-gray-500">วันที่ส่ง</label>
              <div className="flex gap-2 mt-1">
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl p-2 text-sm" />
                <button onClick={() => setFilterDate(today)} className="bg-green-500 text-white text-sm px-3 rounded-xl">วันนี้</button>
              </div>
            </div>

            {/* Zone Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              <button onClick={() => setFilterZone('')}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${!filterZone ? 'bg-green-500 text-white' : 'bg-white text-gray-600'}`}>
                ทุกโซน
              </button>
              {zones
                .filter(z => allDeliveries.some(d => d.zone_id === z.id && (d.status === 'pending' || d.status === 'packed')))
                .map(z => {
                  const zoneCount = allDeliveries.filter(d => d.zone_id === z.id && (d.status === 'pending' || d.status === 'packed')).length
                  return (
                    <button key={z.id} onClick={() => setFilterZone(z.id)}
                      className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${filterZone === z.id ? 'bg-green-500 text-white' : 'bg-white text-gray-600'}`}>
                      📍 {z.name} ({zoneCount})
                    </button>
                  )
                })}
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {(['pending', 'packed', 'delivered', 'all'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${filterStatus === s
                    ? s === 'pending' ? 'bg-yellow-500 text-white'
                      : s === 'packed' ? 'bg-orange-500 text-white'
                      : s === 'delivered' ? 'bg-green-500 text-white'
                      : 'bg-gray-800 text-white'
                    : 'bg-white text-gray-600'}`}>
                  {s === 'pending' ? '⏳ รอแพ๊ค' : s === 'packed' ? '📦 แพ๊คแล้ว' : s === 'delivered' ? '✅ ส่งแล้ว' : 'ทั้งหมด'}
                </button>
              ))}
            </div>

            {/* Delivery List */}
            {loading ? (
              <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
            ) : deliveries.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">🛵</div>
                <p>ไม่มีออเดอร์ส่งค่ะ</p>
              </div>
            ) : (
              <div className="space-y-2">
                {deliveries.map((d, index) => (
                  <div key={d.id}
                    onClick={() => { setSelectedDelivery(d); setPackBagCount(d.bag_count || 0) }}
                    className={`bg-white rounded-2xl p-4 shadow-sm cursor-pointer active:scale-95 transition-transform ${d.status === 'delivered' ? 'opacity-60' : ''} ${d.scheduled_date < today && d.status === 'pending' ? 'border-2 border-red-200' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-400 text-sm">#{index + 1}</span>
                          <div className="font-bold text-gray-800">{d.orders?.customers?.name || 'ลูกค้าทั่วไป'}</div>
                        </div>
                        {d.orders?.customers?.address && (
                          <div className="text-xs text-gray-500 mt-1">🏠 {d.orders.customers.location_type} {d.orders.customers.address}</div>
                        )}
                        {d.orders?.customers?.phone && (
                          <div className="text-xs text-gray-500 mt-0.5">📞 {d.orders.customers.phone}</div>
                        )}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {d.zones && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">📍 {d.zones.name}</span>}
                          {d.bag_count > 0 && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">🛍️ {d.bag_count} ถุง</span>}
                          {d.orders?.payment_status === 'pending' && <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full">⏳ ค้างชำระ</span>}
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-orange-500 font-bold">{d.orders?.total.toLocaleString()}฿</div>
                        {d.status === 'delivered' ? (
                          <span className="text-xs text-green-500 font-bold">✅ ส่งแล้ว</span>
                        ) : d.status === 'packed' ? (
                          <button onClick={(e) => { e.stopPropagation(); markAsDelivered(d) }}
                            className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-lg mt-1">ส่งแล้ว</button>
                        ) : (
                          <span className="text-xs text-yellow-500 font-bold">⏳ รอแพ๊ค</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ========== TAB: ฝากของ ========== */}
        {activeTab === 'reservation' && (
          <>
            <div className="bg-purple-50 rounded-2xl p-3 mb-3">
              <div className="text-sm font-bold text-purple-700">🏪 รายการฝากของ</div>
              <div className="text-xs text-purple-500 mt-0.5">รอลูกค้าแจ้งวันส่ง — กดเพื่อนัดส่ง</div>
            </div>

            {reservations.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">🏪</div>
                <p>ไม่มีของฝากค่ะ</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reservations.map(r => (
                  <div key={r.id}
                    onClick={() => {
                      setSelectedReservation(r)
                      setReserveScheduledDate(deliveryRounds[0]?.delivery_date || '')
                      setReserveZoneId('')
                      setReserveBagCount(1)
                    }}
                    className="bg-white rounded-2xl p-4 shadow-sm cursor-pointer active:scale-95 transition-transform border-l-4 border-purple-400">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-800">{r.customers?.name || 'ลูกค้าทั่วไป'}</div>
                        {r.customers?.phone && <div className="text-xs text-gray-500 mt-0.5">📞 {r.customers.phone}</div>}
                        {r.customers?.address && <div className="text-xs text-gray-500">🏠 {r.customers.address}</div>}
                        <div className="text-xs text-gray-400 mt-1">
                          {r.order_items.length} รายการ · {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-purple-500 font-bold">{r.total.toLocaleString()}฿</div>
                        <div className={`text-xs mt-0.5 ${r.payment_status === 'paid' ? 'text-green-500' : 'text-yellow-500'}`}>
                          {r.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                        </div>
                        <div className="text-xs text-purple-400 mt-1">กดเพื่อนัดส่ง →</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ========== Detail Modal (ส่งของปกติ) ========== */}
        {selectedDelivery && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">รายละเอียดออเดอร์</h3>
                <button onClick={() => setSelectedDelivery(null)} className="text-gray-400 text-xl">✕</button>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="font-bold">{selectedDelivery.orders?.customers?.name || 'ลูกค้าทั่วไป'}</div>
                {selectedDelivery.orders?.customers?.phone && <div className="text-sm text-gray-500 mt-1">📞 {selectedDelivery.orders.customers.phone}</div>}
                {selectedDelivery.orders?.customers?.address && <div className="text-sm text-gray-500 mt-1">🏠 {selectedDelivery.orders.customers.location_type} {selectedDelivery.orders.customers.address}</div>}
              </div>

              <div className="mb-3">
                <h4 className="font-bold text-sm text-gray-700 mb-2">รายการ</h4>
                <div className="space-y-1">
                  {selectedDelivery.orders?.order_items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm py-1">
                      <span className="flex-1">{item.products?.name || 'สินค้าถูกลบ'}</span>
                      <span className="font-medium ml-2">{item.quantity} {item.products?.unit || ''}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="flex justify-between text-sm"><span className="text-gray-500">จำนวนถุง</span><span className="font-bold">🛍️ {selectedDelivery.bag_count}</span></div>
                {selectedDelivery.zones && <div className="flex justify-between text-sm"><span className="text-gray-500">โซน</span><span>📍 {selectedDelivery.zones.name}</span></div>}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">วันส่ง</span>
                  <span>{new Date(selectedDelivery.scheduled_date + 'T00:00:00').toLocaleDateString('th-TH')}</span>
                </div>
                <div className="flex justify-between font-bold pt-2 mt-2 border-t border-gray-200">
                  <span>รวมเงิน</span>
                  <span className="text-orange-500">{selectedDelivery.orders?.total.toLocaleString()}฿</span>
                </div>
                <div className="text-right mt-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedDelivery.orders?.payment_status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                    {selectedDelivery.orders?.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                  </span>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-3 mb-3">
                <label className="text-xs text-blue-700 font-bold">📅 แก้วันที่ส่ง</label>
                <div className="flex gap-2 mt-1">
                  <input type="date" defaultValue={selectedDelivery.scheduled_date}
                    onChange={e => setEditScheduledDate(e.target.value)}
                    className="flex-1 border border-blue-200 rounded-xl p-2 text-sm" />
                  <button onClick={() => editScheduledDate && updateScheduledDate(selectedDelivery.id, editScheduledDate)}
                    className="bg-blue-500 text-white px-3 rounded-xl text-sm">บันทึก</button>
                </div>
              </div>

              {selectedDelivery.orders?.note && (
                <div className="bg-yellow-50 rounded-xl p-3 mb-3">
                  <div className="text-xs text-yellow-700 font-bold mb-1">หมายเหตุ</div>
                  <div className="text-sm text-gray-700">{selectedDelivery.orders.note}</div>
                </div>
              )}

              {selectedDelivery.orders?.payment_status === 'pending' && (
                <button onClick={() => markAsPaid(selectedDelivery.orders!.id)}
                  className="w-full bg-green-500 text-white font-bold py-3 rounded-xl mb-2">
                  💰 ชำระเงินแล้ว
                </button>
              )}

              {selectedDelivery.status === 'pending' && (
                <div className="space-y-2">
                  <div className="bg-yellow-50 rounded-xl p-3">
                    <label className="text-xs text-yellow-700 font-bold">📦 จำนวนถุงที่แพ๊ค</label>
                    <input type="number" value={packBagCount} onChange={e => setPackBagCount(Number(e.target.value))}
                      className="w-full border border-yellow-200 rounded-xl p-2 mt-1 text-sm" min="1" placeholder="กรอกจำนวนถุง" />
                  </div>
                  <button onClick={() => markAsPacked(selectedDelivery.id, packBagCount)}
                    className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl">📦 แพ๊คเสร็จแล้ว</button>
                </div>
              )}

              {selectedDelivery.status === 'packed' && (
                <div className="space-y-2">
                  <button onClick={() => markAsDelivered(selectedDelivery)}
                    className="w-full bg-green-500 text-white font-bold py-3 rounded-xl">✅ ส่งแล้ว (ตัด Stock)</button>
                  <button onClick={() => markAsPending(selectedDelivery)}
                    className="w-full bg-yellow-100 text-yellow-700 font-bold py-2 rounded-xl text-sm">↩️ กลับไปสถานะรอแพ๊ค</button>
                </div>
              )}

              {selectedDelivery.status === 'delivered' && (
                <button onClick={() => markAsPending(selectedDelivery)}
                  className="w-full bg-yellow-100 text-yellow-700 font-bold py-3 rounded-xl">
                  ↩️ ยกเลิกการส่ง (คืน Stock)
                </button>
              )}
            </div>
          </div>
        )}

        {/* ========== Reservation Modal (นัดส่งฝากของ) ========== */}
        {selectedReservation && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">🏪 นัดส่งฝากของ</h3>
                <button onClick={() => setSelectedReservation(null)} className="text-gray-400 text-xl">✕</button>
              </div>

              {/* ข้อมูลลูกค้า */}
              <div className="bg-purple-50 rounded-xl p-3 mb-3">
                <div className="font-bold text-purple-800">{selectedReservation.customers?.name || 'ลูกค้าทั่วไป'}</div>
                {selectedReservation.customers?.phone && <div className="text-sm text-gray-500 mt-1">📞 {selectedReservation.customers.phone}</div>}
                {selectedReservation.customers?.address && <div className="text-sm text-gray-500">🏠 {selectedReservation.customers.address}</div>}
              </div>

              {/* รายการสินค้า */}
              <div className="mb-3">
                <h4 className="font-bold text-sm text-gray-700 mb-2">รายการที่ฝากไว้</h4>
                <div className="space-y-1">
                  {selectedReservation.order_items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm py-1 border-b border-gray-100">
                      <span className="flex-1">{item.products?.name || '-'}</span>
                      <span className="font-medium ml-2">{item.quantity} {item.products?.unit || ''}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-bold text-sm mt-2 pt-2">
                  <span>รวม</span>
                  <span className="text-purple-500">{selectedReservation.total.toLocaleString()}฿</span>
                </div>
              </div>

              {/* เลือกวันส่ง */}
              <div className="bg-green-50 rounded-xl p-3 mb-3">
                <label className="text-xs text-green-700 font-bold mb-2 block">📅 เลือกวันส่ง</label>
                {deliveryRounds.length > 0 ? (
                  <select value={reserveScheduledDate} onChange={e => setReserveScheduledDate(e.target.value)}
                    className="w-full border border-green-200 rounded-xl p-2 text-sm bg-white">
                    <option value="">-- เลือกรอบส่ง --</option>
                    {deliveryRounds.map(r => (
                      <option key={r.id} value={r.delivery_date}>
                        🛵 {new Date(r.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {r.note ? ` — ${r.note}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="date" value={reserveScheduledDate} onChange={e => setReserveScheduledDate(e.target.value)}
                    className="w-full border border-green-200 rounded-xl p-2 text-sm bg-white" />
                )}
              </div>

              {/* โซน + ถุง */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-xs text-gray-500">โซน</label>
                  <select value={reserveZoneId} onChange={e => setReserveZoneId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                    <option value="">ไม่ระบุ</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">จำนวนถุง</label>
                  <input type="number" value={reserveBagCount} onChange={e => setReserveBagCount(Number(e.target.value))}
                    min="1" className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                </div>
              </div>

              <button onClick={confirmReservationDelivery} disabled={savingReserve || !reserveScheduledDate}
                className="w-full bg-purple-500 text-white font-bold py-3 rounded-2xl disabled:opacity-50">
                {savingReserve ? 'กำลังบันทึก...' : '📅 ยืนยันนัดส่ง'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}