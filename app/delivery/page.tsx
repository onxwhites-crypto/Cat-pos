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
  deliveries?: {
    id: string
    scheduled_date: string
    status: string
    zone_id: string
    bag_count: number
  }[]
}

export default function DeliveryPage() {
  const router = useRouter()
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])
  const [filterZone, setFilterZone] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'packed' | 'delivered' | 'overdue'>('pending')
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null)
  const [allDeliveries, setAllDeliveries] = useState<{ zone_id: string; status: string }[]>([])
  const [overdueDeliveries, setOverdueDeliveries] = useState<Delivery[]>([]) // ค้างส่งทุกวัน
  const [datesWithOrders, setDatesWithOrders] = useState<{ date: string; count: number }[]>([]) // dot บน calendar
  const [packBagCount, setPackBagCount] = useState(0)
  const [editScheduledDate, setEditScheduledDate] = useState('')

  const [activeTab, setActiveTab] = useState<'delivery' | 'reservation'>('delivery')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [reserveScheduledDate, setReserveScheduledDate] = useState('')
  const [reserveZoneId, setReserveZoneId] = useState('')
  const [reserveBagCount, setReserveBagCount] = useState(1)
  const [savingReserve, setSavingReserve] = useState(false)
  const [deliveryRounds, setDeliveryRounds] = useState<{ id: string; delivery_date: string; note: string | null }[]>([])

  useEffect(() => { fetchData() }, [filterDate, filterZone, filterStatus])

  async function fetchData() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    // ── Main deliveries query ──
    let query = supabase
      .from('deliveries')
      .select(`*, zones(name), orders(id, total, payment_status, note, order_type, customers(id, name, phone, address, location_type), order_items(id, quantity, product_id, products(name, unit)))`)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (filterStatus === 'overdue') {
      // ค้างส่ง = pending หรือ packed ที่วันส่งผ่านมาแล้ว
      query = query.lt('scheduled_date', today).in('status', ['pending', 'packed'])
    } else {
      if (filterDate) query = query.eq('scheduled_date', filterDate)
      if (filterStatus !== 'all') query = query.eq('status', filterStatus)
    }
    if (filterZone) query = query.eq('zone_id', filterZone)

    const { data: d } = await query
    const { data: z } = await supabase.from('zones').select('*').order('sort_order')

    // ── Overdue count (สำหรับ badge) ──
    const { data: overdueD } = await supabase
      .from('deliveries')
      .select(`*, zones(name), orders(id, total, payment_status, note, order_type, customers(id, name, phone, address, location_type), order_items(id, quantity, product_id, products(name, unit)))`)
      .lt('scheduled_date', today)
      .in('status', ['pending', 'packed'])

    // ── วันที่มีออเดอร์ค้าง (dot บน calendar) ──
    const { data: pendingDates } = await supabase
      .from('deliveries')
      .select('scheduled_date')
      .in('status', ['pending', 'packed'])
      .neq('scheduled_date', '2099-12-31')

    const dateCountMap: { [date: string]: number } = {}
    ;(pendingDates || []).forEach((d: any) => {
      dateCountMap[d.scheduled_date] = (dateCountMap[d.scheduled_date] || 0) + 1
    })
    setDatesWithOrders(Object.entries(dateCountMap).map(([date, count]) => ({ date, count })))

    // ── Reservations ──
    const { data: resv } = await supabase
      .from('orders')
      .select(`
        id, total, payment_status, note, order_type, created_at,
        customers(id, name, phone, address, location_type),
        order_items(id, quantity, product_id, products(name, unit)),
        deliveries(id, scheduled_date, status, zone_id, bag_count)
      `)
      .eq('order_type', 'reservation')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })

    const { data: rounds } = await supabase
      .from('delivery_rounds')
      .select('*')
      .gte('delivery_date', today)
      .order('delivery_date', { ascending: true })

    setDeliveries(d || [])
    setZones(z || [])
    setOverdueDeliveries((overdueD as any) || [])
    setReservations((resv as any) || [])
    setDeliveryRounds(rounds || [])
    setLoading(false)

    const { data: allD } = await supabase
      .from('deliveries')
      .select('zone_id, status')
      .eq('scheduled_date', filterDate)
    setAllDeliveries(allD || [])
  }

async function markAsDelivered(delivery: Delivery) {
  await supabase.from('deliveries')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', delivery.id)
  fetchData()
  setSelectedDelivery(null)
}

async function markAsPending(delivery: Delivery) {
  await supabase.from('deliveries')
    .update({ status: 'pending', delivered_at: null })
    .eq('id', delivery.id)
  fetchData()
  setSelectedDelivery(null)
}

  async function updateScheduledDate(id: string, date: string) {
    await supabase.from('deliveries').update({ scheduled_date: date }).eq('id', id)
    fetchData()
    setSelectedDelivery(prev => prev ? { ...prev, scheduled_date: date } : null)
  }

async function markAsPaid(orderId: string) {
  const dateInput = prompt('วันที่รับเงิน (ปปปป-ดด-วว)\nเว้นว่างถ้าเป็นวันนี้ค่ะ')
  if (dateInput === null) return
  const paidDate = dateInput.trim()
    ? new Date(dateInput.trim()).toISOString()
    : new Date().toISOString()
  if (dateInput.trim() && isNaN(new Date(dateInput.trim()).getTime())) {
    alert('รูปแบบวันที่ไม่ถูกต้องค่ะ กรุณากรอกแบบ 2026-05-22')
    return
  }
  await supabase.from('orders').update({ payment_status: 'paid', paid_at: paidDate }).eq('id', orderId)
  }

  async function markAsPacked(id: string, bagCount: number) {
    if (bagCount <= 0) { alert('กรุณากรอกจำนวนถุงค่ะ'); return }
    await supabase.from('deliveries').update({ status: 'packed', bag_count: bagCount }).eq('id', id)
    fetchData()
    setSelectedDelivery(null)
  }

  async function confirmReservationDelivery() {
    if (!selectedReservation || !reserveScheduledDate) { alert('กรุณาเลือกวันส่งค่ะ'); return }
    setSavingReserve(true)
    try {
      const existing = selectedReservation.deliveries?.[0]
      if (existing) {
        // ✅ แก้โซน + วันส่ง + จำนวนถุงด้วย
        await supabase.from('deliveries').update({
          scheduled_date: reserveScheduledDate,
          zone_id: reserveZoneId || null,
          bag_count: reserveBagCount,
          status: 'pending',
        }).eq('id', existing.id)
      } else {
        await supabase.from('deliveries').insert({
          order_id: selectedReservation.id,
          zone_id: reserveZoneId || null,
          scheduled_date: reserveScheduledDate,
          bag_count: reserveBagCount,
          status: 'pending',
          note: selectedReservation.customers?.address || null,
        })
      }
      setSelectedReservation(null)
      setReserveScheduledDate('')
      setReserveZoneId('')
      setReserveBagCount(1)
      setActiveTab('delivery')
      fetchData()
      alert('นัดส่งเรียบร้อยแล้วค่ะ! 📅')
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setSavingReserve(false)
  }

  async function packReservation() {
    if (!selectedReservation) return
    setSavingReserve(true)
    try {
      const existing = selectedReservation.deliveries?.[0]
      if (existing) {
        await supabase.from('deliveries').update({
          status: 'packed',
          bag_count: reserveBagCount,
          zone_id: reserveZoneId || null,
        }).eq('id', existing.id)
      } else {
        await supabase.from('deliveries').insert({
          order_id: selectedReservation.id,
          zone_id: reserveZoneId || null,
          scheduled_date: '2099-12-31',
          bag_count: reserveBagCount,
          status: 'packed',
          note: selectedReservation.customers?.address || null,
        })
      }
      setSelectedReservation(null)
      fetchData()
      alert('บันทึกแพ๊คของเรียบร้อยค่ะ 📦')
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setSavingReserve(false)
  }

  async function resetDeliveryDate() {
    if (!selectedReservation) return
    const existing = selectedReservation.deliveries?.[0]
    if (!existing) return
    if (!confirm('รีเซ็ตวันส่งเป็น "รอระบุวัน" ใช่ไหมคะ?')) return
    setSavingReserve(true)
    try {
      await supabase.from('deliveries').update({
        scheduled_date: '2099-12-31',
        status: 'packed',
      }).eq('id', existing.id)
      fetchData()
      setSelectedReservation(null)
      alert('รีเซ็ตวันส่งเรียบร้อยค่ะ')
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setSavingReserve(false)
  }

  async function markReservationAsPaid(orderId: string) {
    await supabase.from('orders').update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', orderId)
    fetchData()
    setSelectedReservation(null)
    alert('บันทึกการชำระเงินเรียบร้อยค่ะ ✅')
  }

  const today = new Date().toISOString().split('T')[0]
  const totalPending = deliveries.filter(d => d.status === 'pending').length
  const totalPacked = deliveries.filter(d => d.status === 'packed').length
  const totalDelivered = deliveries.filter(d => d.status === 'delivered').length
  const totalBags = deliveries.filter(d => d.status === 'packed').reduce((sum, d) => sum + d.bag_count, 0)
  const pendingReservations = reservations.filter(r => !r.deliveries || r.deliveries.length === 0).length

  return (
    <main className="min-h-screen bg-[#fff5f3]">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')}
            className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform">
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-800">🛵 เดลิเวอรี่</h1>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setActiveTab('delivery')}
            className={`py-2.5 rounded-2xl text-sm font-bold transition-all ${activeTab === 'delivery' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
            🛵 ส่งของ
          </button>
          <button onClick={() => setActiveTab('reservation')}
            className={`py-2.5 rounded-2xl text-sm font-bold transition-all relative ${activeTab === 'reservation' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
            🏪 ฝากของ
            {/* ✅ badge แสดงจำนวน reservation ทั้งหมด */}
          {reservations.filter(r => r.deliveries?.[0]?.status !== 'delivered').length > 0 && (
            <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {reservations.filter(r => r.deliveries?.[0]?.status !== 'delivered').length}
            </span>
)}
          </button>
        </div>
      </div>

      <div className="px-4 pb-8 pt-2 space-y-3">

            {/* Summary */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'รอแพ๊ค', value: totalPending, color: 'text-amber-500' },
                { label: 'แพ๊คแล้ว', value: totalPacked, color: 'text-orange-500' },
                { label: 'ส่งแล้ว', value: totalDelivered, color: 'text-teal-500' },
                { label: 'รวมถุง', value: totalBags, color: 'text-rose-500' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-2xl p-2.5 shadow-sm text-center">
                  <p className="text-xs text-gray-400">{item.label}</p>
                  <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>

                    {/* ══ TAB: ส่งของ ══ */}
        {activeTab === 'delivery' && (
          <>
            {/* ✅ แจ้งเตือนค้างส่ง */}
            {overdueDeliveries.length > 0 && (
              <button
                onClick={() => setFilterStatus('overdue')}
                className="w-full bg-red-50 rounded-2xl p-3 text-left active:scale-[0.98] transition-transform">
                <p className="text-sm font-bold text-red-600">⚠️ มีออเดอร์ค้างส่ง {overdueDeliveries.length} รายการ!</p>
                <p className="text-xs text-red-400 mt-0.5">กดเพื่อดูรายการค้างส่งทั้งหมดค่ะ</p>
              </button>
            )}

            {filterStatus === 'overdue' && (
              <div className="bg-red-50 rounded-2xl p-2 flex items-center justify-between">
                <p className="text-xs font-bold text-red-600">⚠️ แสดงรายการค้างส่งทั้งหมด</p>
                <button onClick={() => setFilterStatus('pending')} className="text-xs text-gray-400 px-2 py-1 bg-white rounded-xl">ปิด ✕</button>
              </div>
            )}

            {/* ✅ Date Filter พร้อม dot บนวันที่มีออเดอร์ค้าง */}
            {filterStatus !== 'overdue' && (
              <div className="bg-white rounded-2xl p-3 shadow-sm">
                <label className="text-xs text-gray-400">วันที่ส่ง</label>
                <div className="flex gap-2 mt-1">
                  <div className="flex-1 relative">
                    <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                      className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none" />
                    {datesWithOrders.find(d => d.date === filterDate) && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-red-400 rounded-full" />
                    )}
                  </div>
                  <button onClick={() => setFilterDate(today)}
                    className="bg-gradient-to-r from-orange-400 to-rose-400 text-white text-xs px-4 rounded-xl font-semibold">
                    วันนี้
                  </button>
                </div>
                {/* แสดงวันที่มีออเดอร์ค้าง */}
                {datesWithOrders.filter(d => d.date < today && d.date !== '2099-12-31').length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    <p className="text-xs text-red-400 w-full">⚠️ วันที่มีออเดอร์ค้างส่ง:</p>
                    {datesWithOrders
                      .filter(d => d.date < today && d.date !== '2099-12-31')
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map(d => (
                        <button key={d.date}
                          onClick={() => { setFilterDate(d.date); setFilterStatus('all') }}
                          className="text-xs bg-red-50 text-red-500 font-semibold px-2.5 py-1 rounded-xl active:scale-95 transition-transform">
                          {new Date(d.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ({d.count})
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Zone Filter */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => setFilterZone('')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${!filterZone ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
                ทุกโซน
              </button>
              {zones
                .filter(z => allDeliveries.some(d => d.zone_id === z.id && (d.status === 'pending' || d.status === 'packed')))
                .map(z => {
                  const zoneCount = allDeliveries.filter(d => d.zone_id === z.id && (d.status === 'pending' || d.status === 'packed')).length
                  return (
                    <button key={z.id} onClick={() => setFilterZone(z.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${filterZone === z.id ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
                      📍 {z.name} ({zoneCount})
                    </button>
                  )
                })}
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {([
                { key: 'pending', label: '⏳ รอแพ๊ค', active: 'bg-amber-400 text-white' },
                { key: 'packed', label: '📦 แพ๊คแล้ว', active: 'bg-orange-500 text-white' },
                { key: 'delivered', label: '✅ ส่งแล้ว', active: 'bg-teal-500 text-white' },
                { key: 'all', label: 'ทั้งหมด', active: 'bg-gray-700 text-white' },
              ] as const).map(btn => (
                <button key={btn.key} onClick={() => setFilterStatus(btn.key as any)}
                  className={`flex-1 min-w-fit py-2 px-3 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all ${filterStatus === btn.key ? btn.active : 'bg-white text-gray-400 shadow-sm'}`}>
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Delivery List */}
            {loading ? (
              <p className="text-center text-gray-400 py-8 text-sm">กำลังโหลด...</p>
            ) : deliveries.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">🛵</div>
                <p className="text-sm">{filterStatus === 'overdue' ? 'ไม่มีออเดอร์ค้างส่งค่ะ 🎉' : 'ไม่มีออเดอร์ส่งค่ะ'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {deliveries.map((d, index) => (
                  <div key={d.id}
                    onClick={() => { setSelectedDelivery(d); setPackBagCount(d.bag_count || 0) }}
                    className={`bg-white rounded-2xl p-4 shadow-sm cursor-pointer active:scale-[0.98] transition-transform ${d.status === 'delivered' ? 'opacity-60' : ''} ${d.scheduled_date < today && d.status === 'pending' ? 'ring-2 ring-red-200' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-gray-400 text-xs">#{index + 1}</span>
                          <p className="font-bold text-gray-800">{d.orders?.customers?.name || 'ลูกค้าทั่วไป'}</p>
                          {filterStatus === 'overdue' && (
                            <span className="text-xs bg-red-50 text-red-400 px-1.5 py-0.5 rounded-lg">
                              {new Date(d.scheduled_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                        {d.orders?.customers?.address && <p className="text-xs text-gray-400 mt-0.5">🏠 {d.orders.customers.location_type} {d.orders.customers.address}</p>}
                        {d.orders?.customers?.phone && <p className="text-xs text-gray-400 mt-0.5">📞 {d.orders.customers.phone}</p>}
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {d.zones && <span className="text-xs bg-purple-50 text-purple-500 px-2 py-0.5 rounded-full">📍 {d.zones.name}</span>}
                          {d.bag_count > 0 && <span className="text-xs bg-rose-50 text-rose-400 px-2 py-0.5 rounded-full">🛍️ {d.bag_count} ถุง</span>}
                          {d.orders?.payment_status === 'pending' && <span className="text-xs bg-amber-50 text-amber-500 px-2 py-0.5 rounded-full">⏳ ค้างชำระ</span>}
                        </div>
                      </div>
                      <div className="text-right ml-2 flex-shrink-0">
                        <p className="text-rose-500 font-bold text-sm">{d.orders?.total.toLocaleString()}฿</p>
                        {d.status === 'delivered' ? (
                          <span className="text-xs text-teal-500 font-bold">✅ ส่งแล้ว</span>
                        ) : d.status === 'packed' ? (
                          <button onClick={e => { e.stopPropagation(); markAsDelivered(d) }}
                            className="bg-teal-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl mt-1 active:scale-95 transition-transform">
                            ส่งแล้ว ✅
                          </button>
                        ) : (
                          <span className="text-xs text-amber-500 font-bold">⏳ รอแพ๊ค</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ TAB: ฝากของ ══ */}
        {activeTab === 'reservation' && (
          <>
            <div className="bg-purple-50 rounded-2xl p-3">
              <p className="text-sm font-bold text-purple-700">🏪 รายการฝากของทั้งหมด ({reservations.filter(r => r.deliveries?.[0]?.status !== 'delivered').length} บิล)</p>
              <p className="text-xs text-purple-400 mt-0.5">กดเพื่อแพ๊คของหรือนัดวันส่งค่ะ</p>
            </div>

            {reservations.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">🏪</div>
                <p className="text-sm">ไม่มีของฝากค่ะ</p>
              </div>
            ) : (
              <div className="space-y-2">
                {reservations
                  .filter(r => r.deliveries?.[0]?.status !== 'delivered')
                  .map(r => {
                  const delivery = r.deliveries?.[0]
                  const isPacked = delivery?.status === 'packed'
                  const hasSchedule = delivery && delivery.scheduled_date !== '2099-12-31'
                  return (
                    <div key={r.id}
                      onClick={() => {
                        setSelectedReservation(r)
                        setReserveScheduledDate(hasSchedule ? delivery.scheduled_date : (deliveryRounds[0]?.delivery_date || ''))
                        setReserveZoneId(delivery?.zone_id || '')
                        setReserveBagCount(delivery?.bag_count || 1)
                      }}
                      className={`bg-white rounded-2xl p-4 shadow-sm cursor-pointer active:scale-[0.98] transition-transform border-l-4 ${isPacked && !hasSchedule ? 'border-orange-400' : hasSchedule ? 'border-teal-400' : 'border-purple-300'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800">{r.customers?.name || 'ลูกค้าทั่วไป'}</p>
                          {r.customers?.phone && <p className="text-xs text-gray-400 mt-0.5">📞 {r.customers.phone}</p>}
                          {r.customers?.address && <p className="text-xs text-gray-400">🏠 {r.customers.address}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            {r.order_items.length} รายการ · {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          <p className="text-purple-500 font-bold">{r.total.toLocaleString()}฿</p>
                          <p className={`text-xs mt-0.5 ${r.payment_status === 'paid' ? 'text-teal-500' : 'text-amber-500'}`}>
                            {r.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                          </p>
                          {isPacked && !hasSchedule && (
                            <p className="text-xs text-orange-500 font-semibold mt-1">📦 แพ๊คแล้ว {delivery.bag_count} ถุง</p>
                          )}
                          {hasSchedule && (
                            <p className="text-xs text-teal-500 font-semibold mt-1">
                              📅 {new Date(delivery!.scheduled_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                          {!delivery && (
                            <p className="text-xs text-purple-400 mt-1">กดนัดส่ง →</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ Detail Modal (ส่งของปกติ) ══ */}
      {selectedDelivery && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">รายละเอียดออเดอร์</h3>
              <button onClick={() => setSelectedDelivery(null)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
              <p className="font-bold text-gray-800">{selectedDelivery.orders?.customers?.name || 'ลูกค้าทั่วไป'}</p>
              {selectedDelivery.orders?.customers?.phone && <p className="text-sm text-gray-400 mt-1">📞 {selectedDelivery.orders.customers.phone}</p>}
              {selectedDelivery.orders?.customers?.address && <p className="text-sm text-gray-400 mt-0.5">🏠 {selectedDelivery.orders.customers.location_type} {selectedDelivery.orders.customers.address}</p>}
            </div>

            <div className="mb-3">
              <p className="font-bold text-sm text-gray-700 mb-2">รายการ</p>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {selectedDelivery.orders?.order_items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm px-4 py-2.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-700">{item.products?.name || 'สินค้าถูกลบ'}</span>
                    <span className="font-semibold text-gray-800">{item.quantity} {item.products?.unit || ''}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-gray-400">จำนวนถุง</span><span className="font-bold">🛍️ {selectedDelivery.bag_count}</span></div>
              {selectedDelivery.zones && <div className="flex justify-between text-sm"><span className="text-gray-400">โซน</span><span>📍 {selectedDelivery.zones.name}</span></div>}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">วันส่ง</span>
                <span>{new Date(selectedDelivery.scheduled_date + 'T00:00:00').toLocaleDateString('th-TH')}</span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t border-gray-50">
                <span>รวมเงิน</span>
                <span className="text-rose-500">{selectedDelivery.orders?.total.toLocaleString()}฿</span>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedDelivery.orders?.payment_status === 'paid' ? 'bg-teal-100 text-teal-600' : 'bg-amber-100 text-amber-600'}`}>
                  {selectedDelivery.orders?.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
              <label className="text-xs text-gray-400 font-bold">📅 แก้วันที่ส่ง</label>
              <div className="flex gap-2 mt-2">
                <input type="date" defaultValue={selectedDelivery.scheduled_date}
                  onChange={e => setEditScheduledDate(e.target.value)}
                  className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none" />
                <button onClick={() => editScheduledDate && updateScheduledDate(selectedDelivery.id, editScheduledDate)}
                  className="bg-gradient-to-r from-orange-400 to-rose-400 text-white px-4 rounded-xl text-sm font-semibold active:scale-95 transition-transform">
                  บันทึก
                </button>
              </div>
            </div>

            {selectedDelivery.orders?.note && (
              <div className="bg-amber-50 rounded-2xl p-3 mb-3">
                <p className="text-xs text-amber-700 font-bold mb-1">หมายเหตุ</p>
                <p className="text-sm text-gray-700">{selectedDelivery.orders.note}</p>
              </div>
            )}

            <div className="space-y-2">
              {selectedDelivery.orders?.payment_status === 'pending' && (
                <button onClick={() => markAsPaid(selectedDelivery.orders!.id)}
                  className="w-full bg-teal-500 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform">
                  💰 ชำระเงินแล้ว
                </button>
              )}
              {selectedDelivery.status === 'pending' && (
                <>
                  <div className="bg-white rounded-2xl p-3 shadow-sm">
                    <label className="text-xs text-gray-400 font-bold">📦 จำนวนถุงที่แพ๊ค</label>
                    <input type="number" value={packBagCount} onChange={e => setPackBagCount(Number(e.target.value))}
                      className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none mt-2" min="1" placeholder="กรอกจำนวนถุง" />
                  </div>
                  <button onClick={() => markAsPacked(selectedDelivery.id, packBagCount)}
                    className="w-full bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform">
                    📦 แพ๊คเสร็จแล้ว
                  </button>
                </>
              )}
              {selectedDelivery.status === 'packed' && (
                <>
                  <button onClick={() => markAsDelivered(selectedDelivery)}
                    className="w-full bg-teal-500 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition-transform">
                    ✅ ส่งแล้ว (ตัด Stock)
                  </button>
                  <button onClick={() => markAsPending(selectedDelivery)}
                    className="w-full bg-white text-amber-600 font-bold py-3 rounded-2xl shadow-sm text-sm active:scale-95 transition-transform">
                    ↩️ กลับไปสถานะรอแพ๊ค
                  </button>
                </>
              )}
              {selectedDelivery.status === 'delivered' && (
                <button onClick={() => markAsPending(selectedDelivery)}
                  className="w-full bg-white text-amber-600 font-bold py-3.5 rounded-2xl shadow-sm active:scale-95 transition-transform">
                  ↩️ ยกเลิกการส่ง
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Reservation Modal ══ */}
      {selectedReservation && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">🏪 จัดการฝากของ</h3>
              <button onClick={() => setSelectedReservation(null)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="bg-purple-50 rounded-2xl p-3 mb-3">
              <p className="font-bold text-purple-800">{selectedReservation.customers?.name || 'ลูกค้าทั่วไป'}</p>
              {selectedReservation.customers?.phone && <p className="text-sm text-gray-500 mt-1">📞 {selectedReservation.customers.phone}</p>}
              {selectedReservation.customers?.address && <p className="text-sm text-gray-500">🏠 {selectedReservation.customers.address}</p>}
            </div>

            {/* สถานะการเงิน */}
            <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-500">สถานะการเงิน</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedReservation.payment_status === 'paid' ? 'bg-teal-100 text-teal-600' : 'bg-amber-100 text-amber-600'}`}>
                  {selectedReservation.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                </span>
              </div>
              {selectedReservation.payment_status === 'pending' && (
                <button onClick={() => markReservationAsPaid(selectedReservation.id)}
                  className="w-full bg-teal-500 text-white font-bold py-2.5 rounded-xl text-sm active:scale-95 transition-transform">
                  💰 บันทึกว่าชำระแล้ว
                </button>
              )}
            </div>

            {/* รายการสินค้า */}
            <div className="mb-3">
              <p className="font-bold text-sm text-gray-700 mb-2">รายการที่ฝากไว้</p>
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {selectedReservation.order_items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm px-4 py-2.5 border-b border-gray-50 last:border-0">
                    <span className="text-gray-700">{item.products?.name || '-'}</span>
                    <span className="font-semibold">{item.quantity} {item.products?.unit || ''}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-sm mt-2 px-1">
                <span>รวม</span>
                <span className="text-purple-500">{selectedReservation.total.toLocaleString()}฿</span>
              </div>
            </div>

            {/* โซน + จำนวนถุง */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs text-gray-400">โซน</label>
                <select value={reserveZoneId} onChange={e => setReserveZoneId(e.target.value)}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm">
                  <option value="">ไม่ระบุ</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">จำนวนถุง</label>
                <input type="number" value={reserveBagCount} onChange={e => setReserveBagCount(Number(e.target.value))}
                  min="1" className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
            </div>

            {/* เลือกวันส่ง */}
            <div className="bg-white rounded-2xl p-3 mb-3 shadow-sm">
              <label className="text-xs text-gray-400 font-bold mb-2 block">📅 เลือกวันส่ง (ถ้านัดแล้ว)</label>
              {deliveryRounds.length > 0 ? (
                <select value={reserveScheduledDate} onChange={e => setReserveScheduledDate(e.target.value)}
                  className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none">
                  <option value="">-- ยังไม่นัดส่ง --</option>
                  {deliveryRounds.map(r => (
                    <option key={r.id} value={r.delivery_date}>
                      🛵 {new Date(r.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {r.note ? ` — ${r.note}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="date" value={reserveScheduledDate} onChange={e => setReserveScheduledDate(e.target.value)}
                  className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none" />
              )}
            </div>

            {/* ปุ่ม */}
            <div className="space-y-2">
              <button onClick={packReservation} disabled={savingReserve || reserveBagCount <= 0}
                className="w-full bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50 active:scale-95 transition-transform">
                {savingReserve ? 'กำลังบันทึก...' : '📦 บันทึกแพ๊คแล้ว (ยังไม่นัดส่ง)'}
              </button>

              {/* ปุ่มรีเซ็ตวันส่ง — แสดงเฉพาะตอนที่มีวันส่งอยู่แล้ว */}
              {selectedReservation.deliveries?.[0] &&
               selectedReservation.deliveries[0].scheduled_date !== '2099-12-31' && (
                <button onClick={resetDeliveryDate} disabled={savingReserve}
                  className="w-full bg-white text-amber-600 font-bold py-3.5 rounded-2xl shadow-sm text-sm disabled:opacity-50 active:scale-95 transition-transform">
                  🔄 ลูกค้าเลื่อน — รอระบุวันใหม่
                </button>
              )}

              <button onClick={confirmReservationDelivery} disabled={savingReserve || !reserveScheduledDate}
                className="w-full bg-gradient-to-r from-purple-400 to-fuchsia-500 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50 active:scale-95 transition-transform">
                {savingReserve ? 'กำลังบันทึก...' : '📅 ยืนยันนัดส่ง'}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}