'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Receipt = {
  id: string
  order_name: string
  order_date: string
  status: string
  service_fee_actual: number
  cod_actual: number | null
  tracking_no: string | null
  received_at: string | null
  problem_note: string | null
  note: string | null
  platforms: { id: string; name: string } | null
  operators: { id: string; name: string } | null
  coupons: { id: string; name: string; discount_value: number } | null
  stock_receipt_items: {
    id: string
    quantity: number
    original_price: number
    item_cost: number
    unit_cost: number
    products: { id: string; name: string; unit: string; image_url: string | null } | null
  }[]
}

export default function ParcelsPage() {
  const router = useRouter()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [operators, setOperators] = useState<{ id: string; name: string }[]>([])
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([])
  const [coupons, setCoupons] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterOperator, setFilterOperator] = useState('')
  const [filterOrderDate, setFilterOrderDate] = useState('')
  const [filterReceivedDate, setFilterReceivedDate] = useState('')



  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'received' | 'problem'>('pending')
  const [selected, setSelected] = useState<Receipt | null>(null)
  const [problemNote, setProblemNote] = useState('')
  const [showProblemDialog, setShowProblemDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'parcels' | 'fees'>('parcels')
  const [feeDate, setFeeDate] = useState(new Date().toISOString().split('T')[0])
  const [showConfirmReceive, setShowConfirmReceive] = useState(false)
  const [actualCOD, setActualCOD] = useState(0)
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0])
  const [pendingReceive, setPendingReceive] = useState<Receipt | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    order_name: '', order_date: '', platform_id: '', operator_id: '',
    coupon_id: '', service_fee_actual: 0, note: '', tracking_no: '',
  })

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: receiptData } = await supabase.from('stock_receipts').select('*').order('created_at', { ascending: false })
    if (!receiptData) { setLoading(false); return }

    const receiptIds = receiptData.map(r => r.id)
    const [{ data: items }, { data: plats }, { data: ops }, { data: cpns }] = await Promise.all([
      supabase.from('stock_receipt_items').select('*, products(id, name, unit, image_url)').in('receipt_id', receiptIds),
      supabase.from('platforms').select('*'),
      supabase.from('operators').select('*'),
      supabase.from('coupons').select('id, name, discount_value'),
    ])

    setPlatforms(plats || [])
    setOperators(ops || [])
    setCoupons(cpns || [])

    const combined = receiptData.map(r => ({
      ...r,
      platforms: plats?.find(p => p.id === r.platform_id) || null,
      operators: ops?.find(o => o.id === r.operator_id) || null,
      coupons: cpns?.find(c => c.id === r.coupon_id) || null,
      stock_receipt_items: (items || []).filter(i => i.receipt_id === r.id),
    }))

    setReceipts(combined as any)
    setLoading(false)
  }

const filtered = receipts.filter(r => {
  const matchStatus = filterStatus === 'all' || r.status === filterStatus
  const matchSearch = !search ||
    r.order_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.tracking_no?.toLowerCase().includes(search.toLowerCase())
  const matchOperator = !filterOperator || r.operators?.id === filterOperator
  const matchOrderDate = !filterOrderDate || r.order_date?.startsWith(filterOrderDate)
  const matchReceivedDate = !filterReceivedDate || r.received_at?.startsWith(filterReceivedDate)
  return matchStatus && matchSearch && matchOperator && matchOrderDate && matchReceivedDate
})

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  const orderedToday = receipts.filter(r => r.order_date?.startsWith(today)).length
  const pendingTotal = receipts.filter(r => r.status === 'pending').length
  const codTotal = receipts.filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + r.stock_receipt_items.reduce((s, i) => s + i.item_cost, 0), 0)
  const receivedToday = receipts.filter(r => r.status === 'received' && r.received_at?.startsWith(today)).length
  const overdueCount = receipts.filter(r => r.status === 'pending' && r.order_date < sevenDaysAgoStr).length

  function getCOD(r: Receipt) {
    return r.stock_receipt_items.reduce((s, i) => s + i.item_cost, 0)
  }

  function getCalDateStr(day: number) {
  const year = calendarMonth.getFullYear()
  const month = calendarMonth.getMonth()
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function getCalDaysInMonth() {
  const year = calendarMonth.getFullYear()
  const month = calendarMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return { firstDay, daysInMonth }
}

function calcCalDayData(dateStr: string) {
  const dayReceipts = receipts.filter(r => r.order_date?.startsWith(dateStr))
  const totalFee = dayReceipts.reduce((s, r) => s + (r.service_fee_actual || 0), 0)
  const receivedReceipts = receipts.filter(r => r.received_at?.startsWith(dateStr))
  const totalCOD = receivedReceipts.reduce((sum, r) => sum + (r.cod_actual ?? getCOD(r)), 0)
  return { totalFee, totalCOD, hasData: dayReceipts.length > 0 || receivedReceipts.length > 0 }
}

function calcSelectedDayDetail(dateStr: string) {
  const dayReceipts = receipts.filter(r => r.order_date?.startsWith(dateStr))
  const receivedReceipts = receipts.filter(r => r.received_at?.startsWith(dateStr))

  const byOperator: { [key: string]: { name: string; byCoupon: { couponName: string; fee: number; count: number }[]; total: number } } = {}
  dayReceipts.forEach(r => {
    const opId = r.operators?.id || 'unknown'
    const opName = r.operators?.name || 'ไม่ระบุ'
    const couponName = r.coupons?.name || 'ไม่ระบุคูปอง'
    const fee = r.service_fee_actual || 0
    if (!byOperator[opId]) byOperator[opId] = { name: opName, byCoupon: [], total: 0 }
    const existing = byOperator[opId].byCoupon.find(c => c.couponName === couponName && c.fee === fee)
    if (existing) { existing.count++ } else { byOperator[opId].byCoupon.push({ couponName, fee, count: 1 }) }
    byOperator[opId].total += fee
  })

  const byPlatform: { [key: string]: { name: string; total: number } } = {}
  receivedReceipts.forEach(r => {
    const platId = r.platforms?.id || 'unknown'
    const platName = r.platforms?.name || 'ไม่ระบุ'
    const cod = r.cod_actual ?? getCOD(r)
    if (!byPlatform[platId]) byPlatform[platId] = { name: platName, total: 0 }
    byPlatform[platId].total += cod
  })

  return {
    operators: Object.values(byOperator),
    platforms: Object.values(byPlatform),
    grandFee: Object.values(byOperator).reduce((s, op) => s + op.total, 0),
    grandCOD: Object.values(byPlatform).reduce((s, p) => s + p.total, 0),
  }
}

  function calcDailyData() {
    const dateReceipts = receipts.filter(r => r.order_date?.startsWith(feeDate))
    const receivedOnDate = receipts.filter(r => r.received_at?.startsWith(feeDate))

    const byOperator: { [key: string]: { id: string; name: string; byCoupon: { couponName: string; fee: number; count: number }[]; total: number } } = {}
    dateReceipts.forEach(r => {
      const opId = r.operators?.id || 'unknown'
      const opName = r.operators?.name || 'ไม่ระบุคนกด'
      const couponName = r.coupons?.name || 'ไม่ระบุคูปอง'
      const fee = r.service_fee_actual || 0
      if (!byOperator[opId]) byOperator[opId] = { id: opId, name: opName, byCoupon: [], total: 0 }
      const existing = byOperator[opId].byCoupon.find(c => c.couponName === couponName && c.fee === fee)
      if (existing) { existing.count++ } else { byOperator[opId].byCoupon.push({ couponName, fee, count: 1 }) }
      byOperator[opId].total += fee
    })

    const totalCODPaid = receivedOnDate.reduce((sum, r) => sum + (r.cod_actual ?? getCOD(r)), 0)
    return {
      fees: Object.values(byOperator),
      grandFeeTotal: Object.values(byOperator).reduce((s, op) => s + op.total, 0),
      receivedCount: receivedOnDate.length,
      totalCODPaid,
    }
  }

  function openEdit(receipt: Receipt) {
    setEditForm({
      order_name: receipt.order_name || '',
      order_date: receipt.order_date?.split('T')[0] || '',
      platform_id: receipt.platforms?.id || '',
      operator_id: receipt.operators?.id || '',
      coupon_id: receipt.coupons?.id || '',
      service_fee_actual: receipt.service_fee_actual || 0,
      note: receipt.note || '',
      tracking_no: receipt.tracking_no || '',
    })
    setShowEdit(true)
  }

  async function handleSaveEdit() {
    if (!selected) return
    setSaving(true)
    try {
      await supabase.from('stock_receipts').update({
        order_name: editForm.order_name || null,
        order_date: editForm.order_date,
        platform_id: editForm.platform_id || null,
        operator_id: editForm.operator_id || null,
        coupon_id: editForm.coupon_id || null,
        service_fee_actual: editForm.service_fee_actual,
        note: editForm.note || null,
        tracking_no: editForm.tracking_no || null,
      }).eq('id', selected.id)
      setShowEdit(false)
      setSelected(null)
      fetchData()
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  function startConfirmReceive(receipt: Receipt) {
    setPendingReceive(receipt)
    setActualCOD(getCOD(receipt))
    setReceivedDate(today)
    setShowConfirmReceive(true)
  }

  async function doConfirmReceive() {
    if (!pendingReceive) return
    setSaving(true)
    try {
      await supabase.from('stock_receipts').update({
        status: 'received',
        received_at: new Date(receivedDate + 'T12:00:00').toISOString(),
        cod_actual: actualCOD,
      }).eq('id', pendingReceive.id)

      for (const item of pendingReceive.stock_receipt_items) {
        if (!item.products) continue
        const { data: product } = await supabase.from('products').select('stock_qty, avg_cost').eq('id', item.products.id).single()
        if (product) {
          const newQty = product.stock_qty + item.quantity
          const newAvgCost = ((product.stock_qty * product.avg_cost) + (item.quantity * item.unit_cost)) / newQty
          await supabase.from('products').update({ stock_qty: newQty, avg_cost: newAvgCost }).eq('id', item.products.id)
          await supabase.from('stock_movements').insert({
            product_id: item.products.id, type: 'IN', quantity: item.quantity,
            unit_cost: item.unit_cost, ref_type: 'receipt', ref_id: pendingReceive.id,
          })
        }
      }

      alert('รับพัสดุเรียบร้อย! สินค้าเข้าสต็อกแล้วค่ะ')
      setShowConfirmReceive(false)
      setPendingReceive(null)
      setSelected(null)
      fetchData()
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  async function markProblem() {
    if (!selected) return
    setSaving(true)
    await supabase.from('stock_receipts').update({ status: 'problem', problem_note: problemNote }).eq('id', selected.id)
    setShowProblemDialog(false); setSelected(null); setProblemNote('')
    fetchData(); setSaving(false)
  }

  async function revertStatus(receipt: Receipt) {
    if (!confirm('ย้อนสถานะกลับเป็น "กำลังมา"?')) return
    await supabase.from('stock_receipts').update({ status: 'pending', received_at: null, problem_note: null, cod_actual: null }).eq('id', receipt.id)
    setSelected(null); fetchData()
  }

  async function deleteReceipt(id: string, name: string) {
    if (!confirm(`ลบออเดอร์ "${name || 'ไม่ระบุชื่อ'}"?`)) return
    await supabase.from('stock_receipts').delete().eq('id', id)
    setSelected(null); fetchData()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">📥 รับพัสดุ</h1>
        </div>

        {/* Dashboard */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-white rounded-xl p-2 shadow-sm text-center">
            <div className="text-xs text-gray-400">สั่งวันนี้</div>
            <div className="text-lg font-bold text-blue-500">{orderedToday}</div>
          </div>
          <div className="bg-white rounded-xl p-2 shadow-sm text-center">
            <div className="text-xs text-gray-400">ค้างรับ</div>
            <div className="text-lg font-bold text-orange-500">{pendingTotal}</div>
          </div>
          <div className="bg-white rounded-xl p-2 shadow-sm text-center">
            <div className="text-xs text-gray-400">รับวันนี้</div>
            <div className="text-lg font-bold text-green-500">{receivedToday}</div>
          </div>
          <div className={`rounded-xl p-2 shadow-sm text-center ${overdueCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
            <div className="text-xs text-gray-400">ค้าง7วัน</div>
            <div className={`text-lg font-bold ${overdueCount > 0 ? 'text-red-500' : 'text-gray-800'}`}>{overdueCount}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => setActiveTab('parcels')}
            className={`py-2 rounded-xl text-sm font-bold ${activeTab === 'parcels' ? 'bg-teal-500 text-white' : 'bg-white text-gray-600'}`}>
            📥 พัสดุ
          </button>
          <button onClick={() => setActiveTab('fees')}
            className={`py-2 rounded-xl text-sm font-bold ${activeTab === 'fees' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-600'}`}>
            💵 ค่ากด & COD
          </button>
        </div>

        {/* Tab: พัสดุ */}
        {activeTab === 'parcels' && (
          <>

<div className="bg-white rounded-2xl p-3 shadow-sm mb-3 space-y-2">
  <div className="flex gap-2">
    <input value={search} onChange={e => setSearch(e.target.value)}
      className="flex-1 border border-gray-200 rounded-xl p-2 text-sm"
      placeholder="🔍 ค้นหาชื่อพัสดุ / เลขพัสดุ..." />
    <select value={filterOperator} onChange={e => setFilterOperator(e.target.value)}
      className="border border-gray-200 rounded-xl p-2 text-sm">
      <option value="">👤 ทั้งหมด</option>
      {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  </div>
  <div className="grid grid-cols-2 gap-2">
    <div>
      <label className="text-xs text-gray-400">📅 วันที่สั่ง</label>
      <input type="date" value={filterOrderDate} onChange={e => setFilterOrderDate(e.target.value)}
        className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
    </div>
    <div>
      <label className="text-xs text-gray-400">📦 วันที่รับของ</label>
      <input type="date" value={filterReceivedDate} onChange={e => setFilterReceivedDate(e.target.value)}
        className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
    </div>
  </div>
  {(filterOrderDate || filterReceivedDate) && (
    <button onClick={() => { setFilterOrderDate(''); setFilterReceivedDate('') }}
      className="w-full bg-gray-100 text-gray-500 py-1.5 rounded-xl text-xs">
      ✕ ล้างตัวกรองวันที่
    </button>
  )}
</div>
            

            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {[
                { key: 'all', label: 'ทั้งหมด', active: 'bg-gray-800 text-white' },
                { key: 'pending', label: '⏳ กำลังมา', active: 'bg-orange-500 text-white' },
                { key: 'received', label: '✅ รับแล้ว', active: 'bg-green-500 text-white' },
                { key: 'problem', label: '⚠️ มีปัญหา', active: 'bg-red-500 text-white' },
              ].map(btn => (
                <button key={btn.key} onClick={() => setFilterStatus(btn.key as any)}
                  className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${filterStatus === btn.key ? btn.active : 'bg-white text-gray-600'}`}>
                  {btn.label}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">📥</div>
                <p>ไม่มีพัสดุค่ะ</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(r => {
                  const cod = getCOD(r)
                  const isOverdue = r.status === 'pending' && r.order_date < sevenDaysAgoStr
                  const totalItems = r.stock_receipt_items.reduce((s, i) => s + i.quantity, 0)
                  return (
                    <button key={r.id} onClick={() => setSelected(r)}
                      className={`w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform ${isOverdue ? 'border-2 border-red-200' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-gray-800">{r.order_name || 'ไม่ระบุชื่อ'}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {r.platforms?.name} · สั่ง {new Date(r.order_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                            {r.received_at && ` · รับ ${new Date(r.received_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`}
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ml-2 ${r.status === 'received' ? 'bg-green-100 text-green-600' : r.status === 'problem' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                          {r.status === 'received' ? '✅' : r.status === 'problem' ? '⚠️' : '⏳'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-indigo-600 font-bold">💰 {cod.toFixed(2)}฿</span>
                        <span className="text-xs text-gray-500">👤 {r.operators?.name || '-'}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                        {r.stock_receipt_items.length} รายการ · {totalItems} ชิ้น
                        {r.service_fee_actual > 0 && ` · ค่ากด ${r.service_fee_actual}฿`}
                      </div>
                      {isOverdue && (
                        <div className="text-xs text-red-500 font-bold mt-1">
                          ⚠️ ค้างมา {Math.ceil((Date.now() - new Date(r.order_date).getTime()) / (1000 * 60 * 60 * 24))} วัน
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}

{/* Tab: ค่ากด & COD */}
{activeTab === 'fees' && (
  <div>
    {/* ปฏิทิน */}
    <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
          className="text-gray-500 text-xl px-2">‹</button>
        <span className="font-bold text-gray-800 text-sm">
          {calendarMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
          className="text-gray-500 text-xl px-2">›</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d => (
          <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: getCalDaysInMonth().firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: getCalDaysInMonth().daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = getCalDateStr(day)
          const { totalFee, totalCOD, hasData } = calcCalDayData(dateStr)
          const isSelected = selectedCalDate === dateStr
          const isToday = dateStr === today

          return (
            <button key={day} onClick={() => setSelectedCalDate(isSelected ? null : dateStr)}
              className={`rounded-xl p-1 min-h-[52px] text-left transition-all ${
                isSelected ? 'bg-indigo-100 ring-2 ring-indigo-400' :
                isToday ? 'bg-orange-50 ring-1 ring-orange-300' :
                hasData ? 'bg-indigo-50' : 'bg-gray-50'
              }`}>
              <div className="text-xs font-bold text-right pr-0.5 mb-0.5 text-gray-700">{day}</div>
              {totalFee > 0 && (
                <div className="text-center text-xs text-indigo-600 font-medium leading-tight">
                  {totalFee}
                </div>
              )}
              {totalCOD > 0 && (
                <div className="text-center text-xs text-green-600 font-medium leading-tight">
                  {totalCOD.toFixed(0)}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-2 pt-2 border-t border-gray-100 text-xs">
        <span className="text-indigo-600">💵 ค่ากด</span>
        <span className="text-green-600">💰 COD</span>
      </div>
    </div>

    {/* Detail ของวันที่เลือก หรือ picker เดิม */}
    {selectedCalDate ? (
      (() => {
        const d = calcSelectedDayDetail(selectedCalDate)
        const displayDate = new Date(selectedCalDate + 'T12:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: '2-digit' })
        return (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-bold text-gray-700 mb-3">💵 ค่ากดสินค้า · {displayDate}</h3>
              {d.operators.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-2">ไม่มีข้อมูลค่ะ</p>
              ) : (
                <div className="space-y-3">
                  {d.operators.map((op, i) => (
                    <div key={i} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                      <div className="flex justify-between items-center mb-1">
                        <div className="font-medium text-gray-800 text-sm">👤 {op.name}</div>
                        <div className="text-xs text-gray-500">{op.byCoupon.reduce((s, c) => s + c.count, 0)} บิล</div>
                      </div>
                      {op.byCoupon.map((c, j) => (
                        <div key={j} className="flex justify-between text-xs text-gray-500 mb-0.5">
                          <span>{c.couponName} (ค่ากด {c.fee}฿) × {c.count} บิล</span>
                          <span>{(c.fee * c.count).toLocaleString()}฿</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-bold text-indigo-600 pt-1 mt-1">
                        <span>รวม</span><span>{op.total.toLocaleString()}฿</span>
                      </div>
                    </div>
                  ))}
                  <div className="bg-indigo-50 rounded-xl p-3 flex justify-between items-center">
                    <span className="font-bold text-indigo-700">รวมค่ากดทั้งวัน</span>
                    <span className="text-xl font-bold text-indigo-600">{d.grandFee.toLocaleString()}฿</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-bold text-gray-700 mb-3">💰 COD จ่ายจริง · {displayDate}</h3>
              {d.platforms.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-2">ไม่มีการรับพัสดุวันนี้ค่ะ</p>
              ) : (
                <div className="space-y-2">
                  {d.platforms.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                      <span className="text-gray-600">ยอด {p.name}</span>
                      <span className="font-bold text-green-600">{p.total.toFixed(2)}฿</span>
                    </div>
                  ))}
                  <div className="bg-green-50 rounded-xl p-3 flex justify-between items-center mt-1">
                    <span className="font-bold text-green-700">รวม COD ทั้งหมด</span>
                    <span className="text-xl font-bold text-green-600">{d.grandCOD.toFixed(2)}฿</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()
    ) : (
      // ไม่ได้เลือกวัน → แสดง picker เดิม
      <div>
        <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
          <label className="text-xs text-gray-500">เลือกวันที่</label>
          <div className="flex gap-2 mt-1">
            <input type="date" value={feeDate} onChange={e => setFeeDate(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl p-2 text-sm" />
            <button onClick={() => setFeeDate(today)}
              className="bg-indigo-500 text-white text-sm px-3 rounded-xl">วันนี้</button>
          </div>
        </div>

        {(() => {
          const { fees, grandFeeTotal, receivedCount, totalCODPaid } = calcDailyData()
          // COD by platform สำหรับ feeDate
          const receivedOnDate = receipts.filter(r => r.received_at?.startsWith(feeDate))
          const byPlatform: { [key: string]: { name: string; total: number } } = {}
          receivedOnDate.forEach(r => {
            const platId = r.platforms?.id || 'unknown'
            const platName = r.platforms?.name || 'ไม่ระบุ'
            const cod = r.cod_actual ?? getCOD(r)
            if (!byPlatform[platId]) byPlatform[platId] = { name: platName, total: 0 }
            byPlatform[platId].total += cod
          })

          return (
            <div className="space-y-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-3">💵 ค่ากดสินค้า</h3>
                {fees.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-2">ไม่มีข้อมูลค่ะ</p>
                ) : (
                  <div className="space-y-3">
                    {fees.map((op, i) => (
                      <div key={i} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                        <div className="flex justify-between items-center mb-1">
                          <div className="font-medium text-gray-800 text-sm">👤 {op.name}</div>
                          <div className="text-xs text-gray-500">{op.byCoupon.reduce((s, c) => s + c.count, 0)} บิล</div>
                        </div>
                        {op.byCoupon.map((c, j) => (
                          <div key={j} className="flex justify-between text-xs text-gray-500 mb-0.5">
                            <span>{c.couponName} (ค่ากด {c.fee}฿) × {c.count} บิล</span>
                            <span>{(c.fee * c.count).toLocaleString()}฿</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-bold text-indigo-600 pt-1 mt-1">
                          <span>รวม</span><span>{op.total.toLocaleString()}฿</span>
                        </div>
                      </div>
                    ))}
                    <div className="bg-indigo-50 rounded-xl p-3 flex justify-between items-center">
                      <span className="font-bold text-indigo-700">รวมค่ากดทั้งวัน</span>
                      <span className="text-xl font-bold text-indigo-600">{grandFeeTotal.toLocaleString()}฿</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-3">💰 COD จ่ายจริง</h3>
                {receivedCount === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-2">ไม่มีการรับพัสดุวันนี้ค่ะ</p>
                ) : (
                  <div className="space-y-2">
                    {Object.values(byPlatform).map((p, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                        <span className="text-gray-600">ยอด {p.name}</span>
                        <span className="font-bold text-green-600">{p.total.toFixed(2)}฿</span>
                      </div>
                    ))}
                    <div className="bg-green-50 rounded-xl p-3 flex justify-between items-center mt-1">
                      <span className="font-bold text-green-700">รวม COD ทั้งหมด</span>
                      <span className="text-xl font-bold text-green-600">{totalCODPaid.toFixed(2)}฿</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    )}
  </div>
)}

      </div>
    </main>
  )
}