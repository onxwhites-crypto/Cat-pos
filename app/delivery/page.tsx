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
      products: { name: string; unit: string } | null
    }[]
  } | null
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
  const [allDeliveries, setAllDeliveries] = useState<Delivery[]>([])
  const [packBagCount, setPackBagCount] = useState(0)
  const [editScheduledDate, setEditScheduledDate] = useState('')

  useEffect(() => { fetchData() }, [filterDate, filterZone, filterStatus])

  async function fetchData() {
    setLoading(true)

    let query = supabase
      .from('deliveries')
      .select(`
        *,
        zones(name),
        orders(
          id, total, payment_status, note,
          customers(id, name, phone, address, location_type),
          order_items(id, quantity, products(name, unit))
        )
      `)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (filterDate) query = query.eq('scheduled_date', filterDate)
    if (filterZone) query = query.eq('zone_id', filterZone)
    if (filterStatus !== 'all') query = query.eq('status', filterStatus)

    const { data: d } = await query
    const { data: z } = await supabase.from('zones').select('*').order('sort_order')

setDeliveries(d || [])
setZones(z || [])
setLoading(false)

// ดึงทั้งหมดแยก ไม่ filter status/zone เพื่อนับจำนวนโซน
const { data: allD } = await supabase
  .from('deliveries')
  .select('zone_id, status')
  .eq('scheduled_date', filterDate)
setAllDeliveries(allD || [])
  }

  async function markAsDelivered(id: string) {
    await supabase.from('deliveries').update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    }).eq('id', id)
    fetchData()
    setSelectedDelivery(null)
  }

  async function markAsPending(id: string) {
    await supabase.from('deliveries').update({
      status: 'pending',
      delivered_at: null,
    }).eq('id', id)
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
    // อัพเดท selectedDelivery ให้แสดงสถานะใหม่ ไม่ปิด modal
    setSelectedDelivery(prev => prev ? {
      ...prev,
      orders: prev.orders ? { ...prev.orders, payment_status: 'paid' } : null
    } : null)
  }

  async function markAsPacked(id: string, bagCount: number) {
  if (bagCount <= 0) {
    alert('กรุณากรอกจำนวนถุงค่ะ')
    return
  }
  await supabase.from('deliveries').update({
    status: 'packed',
    bag_count: bagCount,
  }).eq('id', id)
  fetchData()
  setSelectedDelivery(null)
}

  // สรุปวันนี้
  const today = new Date().toISOString().split('T')[0]
  const totalPending = deliveries.filter(d => d.status === 'pending').length
  const totalPacked = deliveries.filter(d => d.status === 'packed').length
  const totalDelivered = deliveries.filter(d => d.status === 'delivered').length
  const totalBags = deliveries.filter(d => d.status === 'packed').reduce((sum, d) => sum + d.bag_count, 0)


  // เช็คค้างส่งจากเมื่อวาน
  const overdueCount = deliveries.filter(d =>
    d.status === 'pending' && d.scheduled_date < today
  ).length

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">🛵 เดลิเวอรี่</h1>
        </div>

        {/* Overdue Warning */}
        {overdueCount > 0 && filterDate === today && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-3">
            <div className="text-sm font-bold text-red-600">⚠️ มีออเดอร์ค้างส่ง</div>
            <div className="text-xs text-red-500 mt-1">
              มี {overdueCount} ออเดอร์เลยกำหนดส่งแล้วค่ะ
            </div>
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
            <input type="date" value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl p-2 text-sm" />
            <button onClick={() => setFilterDate(today)}
              className="bg-green-500 text-white text-sm px-3 rounded-xl">
              วันนี้
            </button>
          </div>
        </div>

        {/* Zone Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button onClick={() => setFilterZone('')}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              !filterZone ? 'bg-green-500 text-white' : 'bg-white text-gray-600'
            }`}>
            ทุกโซน
          </button>

{zones
  .filter(z => allDeliveries.some(d => d.zone_id === z.id && (d.status === 'pending' || d.status === 'packed')))
  .map(z => {
    const zoneCount = allDeliveries.filter(d => d.zone_id === z.id && (d.status === 'pending' || d.status === 'packed')).length

    return (
      <button key={z.id} onClick={() => setFilterZone(z.id)}
        className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
          filterZone === z.id ? 'bg-green-500 text-white' : 'bg-white text-gray-600'
        }`}>
        📍 {z.name} ({zoneCount})
      </button>
    )
  })}
        </div>

{/* Status Filter */}
<div className="flex gap-2 mb-3 overflow-x-auto pb-1">
  <button onClick={() => setFilterStatus('pending')}
    className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${
      filterStatus === 'pending' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'
    }`}>
    ⏳ รอแพ๊ค
  </button>
  <button onClick={() => setFilterStatus('packed')}
    className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${
      filterStatus === 'packed' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'
    }`}>
    📦 แพ๊คแล้ว
  </button>
  <button onClick={() => setFilterStatus('delivered')}
    className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${
      filterStatus === 'delivered' ? 'bg-green-500 text-white' : 'bg-white text-gray-600'
    }`}>
    ✅ ส่งแล้ว
  </button>
  <button onClick={() => setFilterStatus('all')}
    className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${
      filterStatus === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'
    }`}>
    ทั้งหมด
  </button>
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
                className={`bg-white rounded-2xl p-4 shadow-sm cursor-pointer active:scale-95 transition-transform ${
                  d.status === 'delivered' ? 'opacity-60' : ''
                } ${d.scheduled_date < today && d.status === 'pending' ? 'border-2 border-red-200' : ''}`}>

                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-400 text-sm">#{index + 1}</span>
                      <div className="font-bold text-gray-800">
                        {d.orders?.customers?.name || 'ลูกค้าทั่วไป'}
                      </div>
                    </div>
                    {d.orders?.customers?.address && (
                      <div className="text-xs text-gray-500 mt-1">
                        🏠 {d.orders.customers.location_type} {d.orders.customers.address}
                      </div>
                    )}
                    {d.orders?.customers?.phone && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        📞 {d.orders.customers.phone}
                      </div>
                    )}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {d.zones && (
                        <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                          📍 {d.zones.name}
                        </span>
                      )}

{d.bag_count > 0 && (
  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
    🛍️ {d.bag_count} ถุง
  </span>
)}

                      {d.orders?.payment_status === 'pending' && (
                        <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full">
                          ⏳ ค้างชำระ
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right ml-2">
                    <div className="text-orange-500 font-bold">
                      {d.orders?.total.toLocaleString()}฿
                    </div>

{d.status === 'delivered' ? (
  <span className="text-xs text-green-500 font-bold">✅ ส่งแล้ว</span>
) : d.status === 'packed' ? (
  <button onClick={(e) => { e.stopPropagation(); markAsDelivered(d.id) }}
    className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-lg mt-1">
    ส่งแล้ว
  </button>
) : (
  <span className="text-xs text-yellow-500 font-bold">⏳ รอแพ๊ค</span>
)}


                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selectedDelivery && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">รายละเอียดออเดอร์</h3>
                <button onClick={() => setSelectedDelivery(null)} className="text-gray-400 text-xl">✕</button>
              </div>

              {/* Customer */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="font-bold">
                  {selectedDelivery.orders?.customers?.name || 'ลูกค้าทั่วไป'}
                </div>
                {selectedDelivery.orders?.customers?.phone && (
                  <div className="text-sm text-gray-500 mt-1">
                    📞 {selectedDelivery.orders.customers.phone}
                  </div>
                )}
                {selectedDelivery.orders?.customers?.address && (
                  <div className="text-sm text-gray-500 mt-1">
                    🏠 {selectedDelivery.orders.customers.location_type} {selectedDelivery.orders.customers.address}
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="mb-3">
                <h4 className="font-bold text-sm text-gray-700 mb-2">รายการ</h4>
                <div className="space-y-1">
                  {selectedDelivery.orders?.order_items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm py-1">
                      <span className="flex-1">{item.products?.name || 'สินค้าถูกลบ'}</span>
                      <span className="font-medium ml-2">
                        {item.quantity} {item.products?.unit || ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">จำนวนถุง</span>
                  <span className="font-bold">🛍️ {selectedDelivery.bag_count}</span>
                </div>
                {selectedDelivery.zones && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">โซน</span>
                    <span>📍 {selectedDelivery.zones.name}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">วันส่ง</span>
                  <span>{new Date(selectedDelivery.scheduled_date).toLocaleDateString('th-TH')}</span>
                </div>
                <div className="flex justify-between font-bold pt-2 mt-2 border-t border-gray-200">
                  <span>รวมเงิน</span>
                  <span className="text-orange-500">
                    {selectedDelivery.orders?.total.toLocaleString()}฿
                  </span>
                </div>
                <div className="text-right mt-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    selectedDelivery.orders?.payment_status === 'paid'
                      ? 'bg-green-100 text-green-600'
                      : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    {selectedDelivery.orders?.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                  </span>
                </div>
              </div>

{/* แก้วันที่ส่ง */}
<div className="bg-blue-50 rounded-xl p-3 mb-3">
  <label className="text-xs text-blue-700 font-bold">📅 แก้วันที่ส่ง</label>
  <div className="flex gap-2 mt-1">
    <input type="date"
      defaultValue={selectedDelivery.scheduled_date}
      onChange={e => setEditScheduledDate(e.target.value)}
      className="flex-1 border border-blue-200 rounded-xl p-2 text-sm" />
    <button onClick={() => editScheduledDate && updateScheduledDate(selectedDelivery.id, editScheduledDate)}
      className="bg-blue-500 text-white px-3 rounded-xl text-sm">บันทึก</button>
  </div>
</div>


              {/* Note */}
              {selectedDelivery.orders?.note && (
                <div className="bg-yellow-50 rounded-xl p-3 mb-3">
                  <div className="text-xs text-yellow-700 font-bold mb-1">หมายเหตุ</div>
                  <div className="text-sm text-gray-700">{selectedDelivery.orders.note}</div>
                </div>
              )}

{/* ปุ่มชำระเงิน - แสดงเมื่อยังค้างชำระ */}
{selectedDelivery.orders?.payment_status === 'pending' && (
  <button onClick={() => markAsPaid(selectedDelivery.orders!.id)}
    className="w-full bg-green-500 text-white font-bold py-3 rounded-xl mb-2">
    💰 ชำระเงินแล้ว
  </button>
)}

{/* Action */}
{selectedDelivery.status === 'pending' && (
  <div className="space-y-2">
    <div className="bg-yellow-50 rounded-xl p-3">
      <label className="text-xs text-yellow-700 font-bold">📦 จำนวนถุงที่แพ๊ค</label>
      <input type="number" value={packBagCount}
        onChange={e => setPackBagCount(Number(e.target.value))}
        className="w-full border border-yellow-200 rounded-xl p-2 mt-1 text-sm"
        min="1" placeholder="กรอกจำนวนถุง" />
    </div>
    <button onClick={() => markAsPacked(selectedDelivery.id, packBagCount)}
      className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl">
      📦 แพ๊คเสร็จแล้ว
    </button>
  </div>
)}

{selectedDelivery.status === 'packed' && (
  <div className="space-y-2">
    <button onClick={() => markAsDelivered(selectedDelivery.id)}
      className="w-full bg-green-500 text-white font-bold py-3 rounded-xl">
      ✅ ส่งแล้ว
    </button>
    <button onClick={() => markAsPending(selectedDelivery.id)}
      className="w-full bg-yellow-100 text-yellow-700 font-bold py-2 rounded-xl text-sm">
      ↩️ กลับไปสถานะรอแพ๊ค
    </button>
  </div>
)}

{selectedDelivery.status === 'delivered' && (
  <button onClick={() => markAsPending(selectedDelivery.id)}
    className="w-full bg-yellow-100 text-yellow-700 font-bold py-3 rounded-xl">
    ↩️ ยกเลิกการส่ง
  </button>
)}


            </div>
          </div>
        )}

      </div>
    </main>
  )
}