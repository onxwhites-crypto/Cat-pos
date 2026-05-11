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

type Product = { id: string; name: string; code: string; unit: string; image_url: string | null }

export default function ParcelsPage() {
  const router = useRouter()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [operators, setOperators] = useState<{ id: string; name: string }[]>([])
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([])
  const [coupons, setCoupons] = useState<{ id: string; name: string }[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
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

  // ── Edit Items ──
  const [showEditItems, setShowEditItems] = useState(false)
  const [editItems, setEditItems] = useState<{ id: string; product_id: string; product_name: string; product_unit: string; product_image: string | null; quantity: number; original_price: number }[]>([])
  const [showSearchProduct, setShowSearchProduct] = useState(false)
  const [searchProduct, setSearchProduct] = useState('')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: receiptData } = await supabase.from('stock_receipts').select('*').order('created_at', { ascending: false })
    if (!receiptData) { setLoading(false); return }

    const receiptIds = receiptData.map(r => r.id)
    const [{ data: items }, { data: plats }, { data: ops }, { data: cpns }, { data: prods }] = await Promise.all([
      supabase.from('stock_receipt_items').select('*, products(id, name, unit, image_url)').in('receipt_id', receiptIds),
      supabase.from('platforms').select('*'),
      supabase.from('operators').select('*'),
      supabase.from('coupons').select('id, name, discount_value'),
      supabase.from('products').select('id, name, code, unit, image_url').eq('is_active', true),
    ])

    setPlatforms(plats || [])
    setOperators(ops || [])
    setCoupons(cpns || [])
    setAllProducts(prods || [])

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

  function openEditItems(receipt: Receipt) {
    setEditItems(receipt.stock_receipt_items.map(i => ({
      id: i.id,
      product_id: i.products?.id || '',
      product_name: i.products?.name || '',
      product_unit: i.products?.unit || '',
      product_image: i.products?.image_url || null,
      quantity: i.quantity,
      original_price: i.original_price,
    })))
    setShowEditItems(true)
  }

  async function handleSaveEditItems() {
    if (!selected) return
    setSaving(true)
    try {
      // อัปเดตทีละรายการ
      for (const item of editItems) {
        if (item.id) {
          await supabase.from('stock_receipt_items').update({
            quantity: item.quantity,
            original_price: item.original_price,
          }).eq('id', item.id)
        } else {
          // รายการใหม่
          await supabase.from('stock_receipt_items').insert({
            receipt_id: selected.id,
            product_id: item.product_id,
            quantity: item.quantity,
            original_price: item.original_price,
            item_cost: 0,
            service_fee_share: 0,
            unit_cost: 0,
          })
        }
      }
      setShowEditItems(false)
      setSelected(null)
      fetchData()
      alert('บันทึกรายการสินค้าเรียบร้อยค่ะ')
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  function addProductToEdit(product: Product) {
    if (editItems.find(i => i.product_id === product.id)) {
      setShowSearchProduct(false); setSearchProduct(''); return
    }
    setEditItems(prev => [...prev, {
      id: '', product_id: product.id,
      product_name: product.name, product_unit: product.unit,
      product_image: product.image_url, quantity: 1, original_price: 0,
    }])
    setShowSearchProduct(false); setSearchProduct('')
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
      setShowEdit(false); setSelected(null); fetchData()
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
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
      setShowConfirmReceive(false); setPendingReceive(null); setSelected(null); fetchData()
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  async function markProblem() {
    if (!selected) return
    setSaving(true)
    await supabase.from('stock_receipts').update({ status: 'problem', problem_note: problemNote }).eq('id', selected.id)
    setShowProblemDialog(false); setSelected(null); setProblemNote('')
    fetchData(); setSaving(false)
  }

  // ── ย้อนสถานะ + หักสต็อกคืน ──
  async function revertStatus(receipt: Receipt) {
    if (!confirm('ย้อนสถานะกลับเป็น "กำลังมา"? สต็อกที่เพิ่มไปจะถูกหักออกด้วยค่ะ')) return
    setSaving(true)
    try {
      // หักสต็อกคืน (เฉพาะ received)
      if (receipt.status === 'received') {
        for (const item of receipt.stock_receipt_items) {
          if (!item.products) continue
          const { data: product } = await supabase.from('products').select('stock_qty').eq('id', item.products.id).single()
          if (product) {
            await supabase.from('products').update({ stock_qty: product.stock_qty - item.quantity }).eq('id', item.products.id)
            await supabase.from('stock_movements').insert({
              product_id: item.products.id, type: 'OUT', quantity: item.quantity,
              ref_type: 'revert', ref_id: receipt.id,
            })
          }
        }
      }
      await supabase.from('stock_receipts').update({
        status: 'pending', received_at: null, problem_note: null, cod_actual: null
      }).eq('id', receipt.id)
      setSelected(null); fetchData()
      alert('ย้อนสถานะเรียบร้อยค่ะ')
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  async function deleteReceipt(id: string, name: string) {
    if (!confirm(`ลบออเดอร์ "${name || 'ไม่ระบุชื่อ'}"?`)) return
    await supabase.from('stock_receipts').delete().eq('id', id)
    setSelected(null); fetchData()
  }

  const filteredSearchProducts = allProducts.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.code?.toLowerCase().includes(searchProduct.toLowerCase())
  )

  return (
    <main className="min-h-screen bg-[#fff5f3] p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')}
            className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform">
            ←
          </button>
          <h1 className="text-lg font-bold text-gray-800">📥 รับพัสดุ</h1>
        </div>

        {/* Dashboard */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-white rounded-2xl p-2 shadow-sm text-center">
            <div className="text-xs text-gray-400">สั่งวันนี้</div>
            <div className="text-lg font-bold text-rose-400">{orderedToday}</div>
          </div>
          <div className="bg-white rounded-2xl p-2 shadow-sm text-center">
            <div className="text-xs text-gray-400">ค้างรับ</div>
            <div className="text-lg font-bold text-amber-500">{pendingTotal}</div>
          </div>
          <div className="bg-white rounded-2xl p-2 shadow-sm text-center">
            <div className="text-xs text-gray-400">รับวันนี้</div>
            <div className="text-lg font-bold text-teal-500">{receivedToday}</div>
          </div>
          <div className={`rounded-2xl p-2 shadow-sm text-center ${overdueCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
            <div className="text-xs text-gray-400">ค้าง7วัน</div>
            <div className={`text-lg font-bold ${overdueCount > 0 ? 'text-red-500' : 'text-gray-800'}`}>{overdueCount}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => setActiveTab('parcels')}
            className={`py-2.5 rounded-2xl text-sm font-bold transition-all ${activeTab === 'parcels' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
            📥 พัสดุ
          </button>
          <button onClick={() => setActiveTab('fees')}
            className={`py-2.5 rounded-2xl text-sm font-bold transition-all ${activeTab === 'fees' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
            💵 ค่ากด & COD
          </button>
        </div>

        {/* Tab: พัสดุ */}
        {activeTab === 'parcels' && (
          <>
            <div className="bg-white rounded-2xl p-3 shadow-sm mb-3 space-y-2">
              <div className="flex gap-2">
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-gray-50 rounded-2xl px-3 py-2 text-sm outline-none"
                  placeholder="🔍 ค้นหาชื่อ / เลขพัสดุ..." />
                <select value={filterOperator} onChange={e => setFilterOperator(e.target.value)}
                  className="bg-gray-50 rounded-2xl px-3 py-2 text-sm outline-none">
                  <option value="">👤 ทั้งหมด</option>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400">📅 วันที่สั่ง</label>
                  <input type="date" value={filterOrderDate} onChange={e => setFilterOrderDate(e.target.value)}
                    className="w-full bg-gray-50 rounded-2xl px-3 py-2 text-sm outline-none mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">📦 วันที่รับของ</label>
                  <input type="date" value={filterReceivedDate} onChange={e => setFilterReceivedDate(e.target.value)}
                    className="w-full bg-gray-50 rounded-2xl px-3 py-2 text-sm outline-none mt-1" />
                </div>
              </div>
              {(filterOrderDate || filterReceivedDate) && (
                <button onClick={() => { setFilterOrderDate(''); setFilterReceivedDate('') }}
                  className="w-full bg-gray-50 text-gray-500 py-1.5 rounded-xl text-xs">
                  ✕ ล้างตัวกรองวันที่
                </button>
              )}
            </div>

            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {[
                { key: 'all', label: 'ทั้งหมด' },
                { key: 'pending', label: '⏳ กำลังมา' },
                { key: 'received', label: '✅ รับแล้ว' },
                { key: 'problem', label: '⚠️ มีปัญหา' },
              ].map(btn => (
                <button key={btn.key} onClick={() => setFilterStatus(btn.key as any)}
                  className={`flex-1 min-w-fit py-2 px-3 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all ${
                    filterStatus === btn.key
                      ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm'
                      : 'bg-white text-gray-500 shadow-sm'
                  }`}>
                  {btn.label}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-center text-gray-400 py-8 text-sm">กำลังโหลด...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">📥</div>
                <p className="text-sm">ไม่มีพัสดุค่ะ</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(r => {
                  const cod = getCOD(r)
                  const isOverdue = r.status === 'pending' && r.order_date < sevenDaysAgoStr
                  const totalItems = r.stock_receipt_items.reduce((s, i) => s + i.quantity, 0)
                  return (
                    <button key={r.id} onClick={() => setSelected(r)}
                      className={`w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform ${isOverdue ? 'ring-2 ring-red-200' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-800">{r.order_name || 'ไม่ระบุชื่อ'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {r.platforms?.name} · สั่ง {new Date(r.order_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                            {r.received_at && ` · รับ ${new Date(r.received_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ml-2 flex-shrink-0 ${
                          r.status === 'received' ? 'bg-teal-100 text-teal-600' :
                          r.status === 'problem' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          {r.status === 'received' ? '✅' : r.status === 'problem' ? '⚠️' : '⏳'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-rose-500 font-bold">💰 {cod.toFixed(2)}฿</span>
                        <span className="text-xs text-gray-500">👤 {r.operators?.name || '-'}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-50 text-xs text-gray-400">
                        {r.stock_receipt_items.length} รายการ · {totalItems} ชิ้น
                        {r.service_fee_actual > 0 && ` · ค่ากด ${r.service_fee_actual}฿`}
                      </div>
                      {isOverdue && (
                        <p className="text-xs text-red-500 font-bold mt-1">
                          ⚠️ ค้างมา {Math.ceil((Date.now() - new Date(r.order_date).getTime()) / (1000 * 60 * 60 * 24))} วัน
                        </p>
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
            <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  className="text-gray-400 text-xl px-2">‹</button>
                <span className="font-bold text-gray-800 text-sm">
                  {calendarMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  className="text-gray-400 text-xl px-2">›</button>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d => (
                  <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
                ))}
              </div>
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
                        isSelected ? 'bg-rose-100 ring-2 ring-rose-400' :
                        isToday ? 'bg-orange-50 ring-1 ring-orange-300' :
                        hasData ? 'bg-rose-50' : 'bg-gray-50'
                      }`}>
                      <div className="text-xs font-bold text-right pr-0.5 mb-0.5 text-gray-700">{day}</div>
                      {totalFee > 0 && <div className="text-center text-xs text-rose-500 font-medium leading-tight">{totalFee}</div>}
                      {totalCOD > 0 && <div className="text-center text-xs text-teal-600 font-medium leading-tight">{totalCOD.toFixed(0)}</div>}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-3 mt-2 pt-2 border-t border-gray-50 text-xs">
                <span className="text-rose-500">💵 ค่ากด</span>
                <span className="text-teal-600">💰 COD</span>
              </div>
            </div>

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
                            <div key={i} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                              <div className="flex justify-between items-center mb-1">
                                <p className="font-medium text-gray-800 text-sm">👤 {op.name}</p>
                                <p className="text-xs text-gray-400">{op.byCoupon.reduce((s, c) => s + c.count, 0)} บิล</p>
                              </div>
                              {op.byCoupon.map((c, j) => (
                                <div key={j} className="flex justify-between text-xs text-gray-500 mb-0.5">
                                  <span>{c.couponName} (ค่ากด {c.fee}฿) × {c.count} บิล</span>
                                  <span>{(c.fee * c.count).toLocaleString()}฿</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-sm font-bold text-rose-500 pt-1 mt-1">
                                <span>รวม</span><span>{op.total.toLocaleString()}฿</span>
                              </div>
                            </div>
                          ))}
                          <div className="bg-rose-50 rounded-2xl p-3 flex justify-between items-center">
                            <span className="font-bold text-rose-700">รวมค่ากดทั้งวัน</span>
                            <span className="text-xl font-bold text-rose-600">{d.grandFee.toLocaleString()}฿</span>
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
                              <span className="font-bold text-teal-600">{p.total.toFixed(2)}฿</span>
                            </div>
                          ))}
                          <div className="bg-teal-50 rounded-2xl p-3 flex justify-between items-center mt-1">
                            <span className="font-bold text-teal-700">รวม COD ทั้งหมด</span>
                            <span className="text-xl font-bold text-teal-600">{d.grandCOD.toFixed(2)}฿</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()
            ) : (
              <div>
                {(() => {
                  const { fees, grandFeeTotal, receivedCount, totalCODPaid } = calcDailyData()
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
                              <div key={i} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0">
                                <div className="flex justify-between items-center mb-1">
                                  <p className="font-medium text-gray-800 text-sm">👤 {op.name}</p>
                                  <p className="text-xs text-gray-400">{op.byCoupon.reduce((s, c) => s + c.count, 0)} บิล</p>
                                </div>
                                {op.byCoupon.map((c, j) => (
                                  <div key={j} className="flex justify-between text-xs text-gray-500 mb-0.5">
                                    <span>{c.couponName} (ค่ากด {c.fee}฿) × {c.count} บิล</span>
                                    <span>{(c.fee * c.count).toLocaleString()}฿</span>
                                  </div>
                                ))}
                                <div className="flex justify-between text-sm font-bold text-rose-500 pt-1 mt-1">
                                  <span>รวม</span><span>{op.total.toLocaleString()}฿</span>
                                </div>
                              </div>
                            ))}
                            <div className="bg-rose-50 rounded-2xl p-3 flex justify-between items-center">
                              <span className="font-bold text-rose-700">รวมค่ากดทั้งวัน</span>
                              <span className="text-xl font-bold text-rose-600">{grandFeeTotal.toLocaleString()}฿</span>
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
                                <span className="font-bold text-teal-600">{p.total.toFixed(2)}฿</span>
                              </div>
                            ))}
                            <div className="bg-teal-50 rounded-2xl p-3 flex justify-between items-center mt-1">
                              <span className="font-bold text-teal-700">รวม COD ทั้งหมด</span>
                              <span className="text-xl font-bold text-teal-600">{totalCODPaid.toFixed(2)}฿</span>
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

        {/* ══ Detail Modal ══ */}
        {selected && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
            <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-800">รายละเอียดพัสดุ</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 text-xl">✕</button>
              </div>

              {/* ข้อมูล */}
              <div className="bg-white rounded-2xl p-3 mb-3 space-y-1.5 shadow-sm">
                {[
                  ['ชื่อที่สั่ง', selected.order_name || '-'],
                  ['แพลตฟอร์ม', selected.platforms?.name || '-'],
                  ['คนกด', selected.operators?.name || '-'],
                  ['คูปอง', selected.coupons?.name || '-'],
                  ['ค่ากด', `${selected.service_fee_actual?.toFixed(2) || '0'}฿`],
                  ['วันที่สั่ง', new Date(selected.order_date).toLocaleDateString('th-TH')],
                  ...(selected.received_at ? [['วันที่รับของ', new Date(selected.received_at).toLocaleDateString('th-TH')]] : []),
                  ...(selected.cod_actual != null ? [['COD จ่ายจริง', `${selected.cod_actual.toFixed(2)}฿`]] : []),
                ].map(([label, value], i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-semibold text-gray-800">{value}</span>
                  </div>
                ))}
              </div>

              {/* สินค้า */}
              <div className="mb-3">
                <p className="font-bold text-sm text-gray-700 mb-2">รายการสินค้า</p>
                <div className="space-y-2">
                  {selected.stock_receipt_items.map(item => (
                    <div key={item.id} className="bg-white rounded-2xl p-3 flex gap-3 items-center shadow-sm">
                      <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.products?.image_url ? <img src={item.products.image_url} className="w-full h-full object-contain p-1" /> : <span className="text-xl">🐱</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold line-clamp-1">{item.products?.name || 'สินค้าถูกลบ'}</p>
                        <p className="text-xs text-gray-400">ราคา {item.original_price.toFixed(2)}฿</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-rose-500">{item.quantity}</p>
                        <p className="text-xs text-gray-400">{item.products?.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* COD */}
              <div className="bg-rose-50 rounded-2xl p-3 mb-3 flex justify-between items-center">
                <span className="font-bold text-rose-700">💰 ยอด COD ปลายทาง</span>
                <span className="text-2xl font-bold text-rose-600">{getCOD(selected).toFixed(2)}฿</span>
              </div>

              {selected.note && (
                <div className="bg-amber-50 rounded-2xl p-3 mb-3">
                  <p className="text-xs text-amber-700 font-bold mb-1">หมายเหตุ</p>
                  <p className="text-sm">{selected.note}</p>
                </div>
              )}
              {selected.problem_note && (
                <div className="bg-red-50 rounded-2xl p-3 mb-3">
                  <p className="text-xs text-red-700 font-bold mb-1">⚠️ ปัญหาที่พบ</p>
                  <p className="text-sm">{selected.problem_note}</p>
                </div>
              )}

              {/* ปุ่ม */}
              <div className="space-y-2">
                {/* แก้ไขข้อมูล + แก้ไขสินค้า */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => openEdit(selected)}
                    className="bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3 rounded-2xl text-sm active:scale-95 transition-transform">
                    ✏️ แก้ไขข้อมูล
                  </button>
                  <button onClick={() => openEditItems(selected)}
                    className="bg-white text-rose-500 font-bold py-3 rounded-2xl text-sm shadow-sm active:scale-95 transition-transform">
                    🛒 แก้ไขสินค้า
                  </button>
                </div>

                {/* pending: ยืนยันรับ */}
                {selected.status === 'pending' && (
                  <button onClick={() => startConfirmReceive(selected)} disabled={saving}
                    className="w-full bg-teal-500 text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-50 active:scale-95 transition-transform">
                    {saving ? 'กำลังบันทึก...' : '✅ ยืนยันรับสินค้า (เข้าสต็อก)'}
                  </button>
                )}

                {/* pending: มีปัญหา + ลบ */}
                {selected.status === 'pending' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setShowProblemDialog(true); setProblemNote('') }}
                      className="bg-amber-50 text-amber-600 font-bold py-3 rounded-2xl text-sm active:scale-95 transition-transform">
                      ⚠️ มีปัญหา
                    </button>
                    <button onClick={() => deleteReceipt(selected.id, selected.order_name)}
                      className="bg-red-50 text-red-400 font-bold py-3 rounded-2xl text-sm active:scale-95 transition-transform">
                      🗑️ ลบออเดอร์
                    </button>
                  </div>
                )}

                {/* received/problem: ย้อนสถานะ + ลบ */}
                {selected.status !== 'pending' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => revertStatus(selected)} disabled={saving}
                      className="bg-amber-50 text-amber-600 font-bold py-3 rounded-2xl text-sm disabled:opacity-50 active:scale-95 transition-transform">
                      ↩️ ย้อนสถานะ
                    </button>
                    <button onClick={() => deleteReceipt(selected.id, selected.order_name)}
                      className="bg-red-50 text-red-400 font-bold py-3 rounded-2xl text-sm active:scale-95 transition-transform">
                      🗑️ ลบออเดอร์
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ Confirm Receive ══ */}
        {showConfirmReceive && pendingReceive && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-xl">
              <h3 className="font-bold text-gray-800 mb-1">✅ ยืนยันรับสินค้า</h3>
              <p className="text-sm text-gray-400 mb-3">{pendingReceive.order_name || 'ไม่ระบุชื่อ'}</p>
              <div className="bg-gray-50 rounded-2xl p-3 mb-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-400">COD ที่คำนวณได้</span><span>{getCOD(pendingReceive).toFixed(2)}฿</span></div>
                <div className="flex justify-between"><span className="text-gray-400">ค่ากด</span><span className="text-rose-500 font-bold">{pendingReceive.service_fee_actual?.toFixed(2) || '0'}฿</span></div>
              </div>
              <div className="space-y-2 mb-3">
                <div>
                  <label className="text-xs text-gray-400">วันที่รับของจริง</label>
                  <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                    className="w-full bg-gray-50 rounded-2xl px-4 py-2.5 text-sm outline-none mt-1" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">ยอด COD ที่จ่ายจริง (฿)</label>
                  <input type="number" step="0.01" value={actualCOD} onChange={e => setActualCOD(Number(e.target.value))}
                    className="w-full bg-gray-50 rounded-2xl px-4 py-2.5 text-sm outline-none mt-1" autoFocus />
                  <div className="flex gap-2 mt-1.5">
                    <button onClick={() => setActualCOD(Math.ceil(getCOD(pendingReceive)))}
                      className="flex-1 bg-gray-50 text-gray-500 py-1.5 rounded-xl text-xs">ปัดขึ้น {Math.ceil(getCOD(pendingReceive))}฿</button>
                    <button onClick={() => setActualCOD(getCOD(pendingReceive))}
                      className="flex-1 bg-gray-50 text-gray-500 py-1.5 rounded-xl text-xs">ตามระบบ {getCOD(pendingReceive).toFixed(2)}฿</button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setShowConfirmReceive(false); setPendingReceive(null) }}
                  className="bg-gray-100 text-gray-500 py-3 rounded-2xl font-semibold text-sm">ยกเลิก</button>
                <button onClick={doConfirmReceive} disabled={saving}
                  className="bg-teal-500 text-white py-3 rounded-2xl font-bold text-sm disabled:opacity-50">
                  {saving ? 'กำลังบันทึก...' : 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ Edit Info ══ */}
        {showEdit && selected && (
          <div className="fixed inset-0 bg-black/40 z-[60] flex items-end">
            <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-800">✏️ แก้ไขข้อมูล</h3>
                <button onClick={() => setShowEdit(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'ชื่อที่สั่ง', field: 'order_name', type: 'text', placeholder: '' },
                  { label: 'วันที่สั่ง', field: 'order_date', type: 'date', placeholder: '' },
                  { label: 'เลขพัสดุ', field: 'tracking_no', type: 'text', placeholder: 'ถ้ามี' },
                ].map(({ label, field, type, placeholder }) => (
                  <div key={field}>
                    <label className="text-xs text-gray-400">{label}</label>
                    <input type={type} value={(editForm as any)[field]}
                      onChange={e => setEditForm({ ...editForm, [field]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">แพลตฟอร์ม</label>
                    <select value={editForm.platform_id} onChange={e => setEditForm({ ...editForm, platform_id: e.target.value })}
                      className="w-full bg-white rounded-2xl px-3 py-3 text-sm outline-none mt-1 shadow-sm">
                      <option value="">เลือก</option>
                      {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">คนกด</label>
                    <select value={editForm.operator_id} onChange={e => setEditForm({ ...editForm, operator_id: e.target.value })}
                      className="w-full bg-white rounded-2xl px-3 py-3 text-sm outline-none mt-1 shadow-sm">
                      <option value="">เลือก</option>
                      {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">คูปอง</label>
                    <select value={editForm.coupon_id} onChange={e => setEditForm({ ...editForm, coupon_id: e.target.value })}
                      className="w-full bg-white rounded-2xl px-3 py-3 text-sm outline-none mt-1 shadow-sm">
                      <option value="">เลือก</option>
                      {coupons.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">ค่ากด (฿)</label>
                    <input type="number" step="0.01" value={editForm.service_fee_actual}
                      onChange={e => setEditForm({ ...editForm, service_fee_actual: Number(e.target.value) })}
                      className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400">หมายเหตุ</label>
                  <textarea value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                    className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm" rows={2} />
                </div>
              </div>
              <button onClick={handleSaveEdit} disabled={saving}
                className="w-full bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold py-4 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        )}

        {/* ══ Edit Items ══ */}
        {showEditItems && selected && (
          <div className="fixed inset-0 bg-black/40 z-[60] flex items-end">
            <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-gray-800">🛒 แก้ไขสินค้า</h3>
                <button onClick={() => setShowEditItems(false)} className="text-gray-400 text-xl">✕</button>
              </div>

              <div className="space-y-2 mb-3">
                {editItems.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-2xl p-3 shadow-sm flex gap-3 items-center">
                    <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.product_image ? <img src={item.product_image} className="w-full h-full object-contain p-1" /> : <span className="text-xl">🐱</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{item.product_name}</p>
                      <div className="flex gap-2 mt-1">
                        <div className="flex-1">
                          <label className="text-xs text-gray-400">จำนวน</label>
                          <input type="number" value={item.quantity}
                            onChange={e => setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) } : it))}
                            className="w-full bg-gray-50 rounded-xl px-2 py-1 text-sm outline-none mt-0.5 text-center" min="1" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-400">ราคารวม</label>
                          <input type="number" value={item.original_price}
                            onChange={e => setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, original_price: Number(e.target.value) } : it))}
                            className="w-full bg-gray-50 rounded-xl px-2 py-1 text-sm outline-none mt-0.5 text-center" />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-300 text-lg flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>

              <button onClick={() => { setShowSearchProduct(true); setSearchProduct('') }}
                className="w-full bg-white text-rose-400 font-bold py-3 rounded-2xl shadow-sm text-sm mb-4 active:scale-95 transition-transform">
                + เพิ่มสินค้า
              </button>

              <button onClick={handleSaveEditItems} disabled={saving}
                className="w-full bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold py-4 rounded-2xl disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ บันทึกรายการสินค้า'}
              </button>
            </div>
          </div>
        )}

        {/* ══ Search Product for Edit Items ══ */}
        {showSearchProduct && (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-end">
            <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[75vh] overflow-y-auto">
              <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-gray-800">เพิ่มสินค้า</h3>
                <button onClick={() => setShowSearchProduct(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <input autoFocus value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mb-3 shadow-sm placeholder-gray-300"
                placeholder="🔍 ค้นหาสินค้า..." />
              <div className="space-y-1.5 pb-4">
                {filteredSearchProducts.map(p => (
                  <button key={p.id} onClick={() => addProductToEdit(p)}
                    className="w-full bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-transform">
                    <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.image_url ? <img src={p.image_url} className="w-full h-full object-contain p-1" /> : <span>🐱</span>}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-sm text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.code} · {p.unit}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ Problem Dialog ══ */}
        {showProblemDialog && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-xl">
              <h3 className="font-bold text-gray-800 mb-3">⚠️ สินค้ามีปัญหา</h3>
              <textarea value={problemNote} onChange={e => setProblemNote(e.target.value)}
                autoFocus rows={3}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none mb-3"
                placeholder="เช่น กล่องบุบ, ของไม่ครบ, สินค้าเสียหาย..." />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowProblemDialog(false)}
                  className="bg-gray-100 text-gray-500 py-3 rounded-2xl font-semibold text-sm">ยกเลิก</button>
                <button onClick={markProblem} disabled={!problemNote.trim() || saving}
                  className="bg-red-400 text-white py-3 rounded-2xl font-bold text-sm disabled:opacity-50">บันทึก</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}