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
  tracking_no: string | null
  received_at: string | null
  problem_note: string | null
  note: string | null
  platforms: { name: string } | null
  operators: { name: string } | null
  coupons: { name: string; discount_value: number } | null
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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'received' | 'problem'>('pending')
  const [selected, setSelected] = useState<Receipt | null>(null)
  const [problemNote, setProblemNote] = useState('')
  const [showProblemDialog, setShowProblemDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actualCOD, setActualCOD] = useState<number>(0)
  const [showConfirmReceive, setShowConfirmReceive] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({
  order_name: '',
  order_date: '',
  platform_id: '',
  operator_id: '',
  coupon_id: '',
  service_fee_actual: 0,
  note: '',
  tracking_no: '',
})
const [editItems, setEditItems] = useState<{
  id: string
  product_id: string
  product_name: string
  product_unit: string
  product_image: string | null
  quantity: number
  original_price: number
  item_cost: number
  unit_cost: number
  service_fee_share: number
}[]>([])
  const [showEditProductSearch, setShowEditProductSearch] = useState(false)
  const [editProductSearch, setEditProductSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'parcels' | 'fees'>('parcels')
  const [feeDate, setFeeDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: receiptData, error } = await supabase
      .from('stock_receipts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error || !receiptData) { setLoading(false); return }

    const receiptIds = receiptData.map(r => r.id)
    const [{ data: items }, { data: platforms }, { data: operators }, { data: coupons }] = await Promise.all([
      supabase.from('stock_receipt_items').select('*, products(id, name, unit, image_url)').in('receipt_id', receiptIds),
      supabase.from('platforms').select('*'),
      supabase.from('operators').select('*'),
      supabase.from('coupons').select('id, name, discount_value'),
    ])

    const combined = receiptData.map(r => ({
      ...r,
      platforms: platforms?.find(p => p.id === r.platform_id) || null,
      operators: operators?.find(o => o.id === r.operator_id) || null,
      coupons: coupons?.find(c => c.id === r.coupon_id) || null,
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
    return matchStatus && matchSearch
  })

  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  const orderedToday = receipts.filter(r => r.order_date === today).length
  const pendingTotal = receipts.filter(r => r.status === 'pending').length
  const codTotal = receipts.filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + r.stock_receipt_items.reduce((s, i) => s + i.item_cost, 0), 0)
  const receivedToday = receipts.filter(r => r.status === 'received' && r.received_at?.startsWith(today)).length
  const overdueCount = receipts.filter(r => r.status === 'pending' && r.order_date < sevenDaysAgoStr).length

  function getCOD(r: Receipt) {
    return r.stock_receipt_items.reduce((s, i) => s + i.item_cost, 0)
  }

  function calcDailyFees() {
    const dateReceipts = receipts.filter(r => r.order_date === feeDate)
    const byOperator: { [key: string]: { name: string; byCoupon: { couponName: string; fee: number; count: number }[]; total: number } } = {}

    dateReceipts.forEach(r => {
      const opKey = r.operators?.name || 'ไม่ระบุคนกด'
      const couponName = r.coupons?.name || 'ไม่ระบุคูปอง'
      const fee = r.service_fee_actual || 0

      if (!byOperator[opKey]) byOperator[opKey] = { name: opKey, byCoupon: [], total: 0 }

      const existing = byOperator[opKey].byCoupon.find(c => c.couponName === couponName && c.fee === fee)
      if (existing) { existing.count++ } else { byOperator[opKey].byCoupon.push({ couponName, fee, count: 1 }) }
      byOperator[opKey].total += fee
    })

    return Object.values(byOperator)
  }

  function openEdit(receipt: Receipt) {
  setEditForm({
    order_name: receipt.order_name || '',
    order_date: receipt.order_date || '',
    platform_id: receipts.find(r => r.id === receipt.id) ? receipt.platforms?.name || '' : '',
    operator_id: receipt.operators?.name || '',
    coupon_id: receipt.coupons?.name || '',
    service_fee_actual: receipt.service_fee_actual || 0,
    note: receipt.note || '',
    tracking_no: receipt.tracking_no || '',
  })
  setEditItems(receipt.stock_receipt_items.map(i => ({
    id: i.id,
    product_id: i.products?.id || '',
    product_name: i.products?.name || '',
    product_unit: i.products?.unit || '',
    product_image: i.products?.image_url || null,
    quantity: i.quantity,
    original_price: i.original_price,
    item_cost: i.item_cost,
    unit_cost: i.unit_cost,
    service_fee_share: i.service_fee_share || 0,
  })))
  setShowEdit(true)
}

async function handleSaveEdit() {
  if (!selected) return
  setSaving(true)
  try {
    // หา platform_id, operator_id, coupon_id จากชื่อ
    const { data: platforms } = await supabase.from('platforms').select('*')
    const { data: operators } = await supabase.from('operators').select('*')
    const { data: coupons } = await supabase.from('coupons').select('*')

    const platform = platforms?.find(p => p.name === editForm.platform_id)
    const operator = operators?.find(o => o.name === editForm.operator_id)
    const coupon = coupons?.find(c => c.name === editForm.coupon_id)

    await supabase.from('stock_receipts').update({
      order_name: editForm.order_name || null,
      order_date: editForm.order_date,
      platform_id: platform?.id || null,
      operator_id: operator?.id || null,
      coupon_id: coupon?.id || null,
      service_fee_actual: editForm.service_fee_actual,
      note: editForm.note || null,
      tracking_no: editForm.tracking_no || null,
    }).eq('id', selected.id)

    // อัพเดท items
    for (const item of editItems) {
      if (item.id) {
        await supabase.from('stock_receipt_items').update({
          quantity: item.quantity,
          original_price: item.original_price,
          item_cost: item.item_cost,
          unit_cost: item.unit_cost,
        }).eq('id', item.id)
      }
    }

    setShowEdit(false)
    setSelected(null)
    fetchData()
    alert('แก้ไขเรียบร้อยค่ะ!')
  } catch (e) {
    alert('เกิดข้อผิดพลาดค่ะ')
  }
  setSaving(false)
}

    async function confirmReceive(receipt: Receipt) {
  // เปิด dialog กรอก COD จริงแทน
  setActualCOD(getCOD(receipt))
  setShowConfirmReceive(true)
}

async function doConfirmReceive(receipt: Receipt, codAmount: number) {
  setSaving(true)
    try {
      await supabase.from('stock_receipts').update({status: 'received',received_at: new Date().toISOString(),
      service_fee_actual: codAmount, // บันทึก COD จริงที่จ่าย
      }).eq('id', receipt.id)
      for (const item of receipt.stock_receipt_items) {
        if (!item.products) continue
        const { data: product } = await supabase.from('products').select('stock_qty, avg_cost').eq('id', item.products.id).single()
        if (product) {
          const newQty = product.stock_qty + item.quantity
          const newAvgCost = ((product.stock_qty * product.avg_cost) + (item.quantity * item.unit_cost)) / newQty
          await supabase.from('products').update({ stock_qty: newQty, avg_cost: newAvgCost }).eq('id', item.products.id)
          await supabase.from('stock_movements').insert({ product_id: item.products.id, type: 'IN', quantity: item.quantity, unit_cost: item.unit_cost, ref_type: 'receipt', ref_id: receipt.id })
        }
      }
      alert('รับพัสดุเรียบร้อย! สินค้าเข้าสต็อกแล้วค่ะ 🎉')
      setShowConfirmReceive(false)
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
    await supabase.from('stock_receipts').update({ status: 'pending', received_at: null, problem_note: null }).eq('id', receipt.id)
    setSelected(null); fetchData()
  }

  async function deleteReceipt(id: string, name: string) {
    if (!confirm(`ลบออเดอร์ "${name || 'ไม่ระบุชื่อ'}" ออกจากระบบ?`)) return
    await supabase.from('stock_receipts').delete().eq('id', id)
    setSelected(null); fetchData()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">📥 รับพัสดุ</h1>
        </div>

        {/* Dashboard */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-white rounded-xl p-2 shadow-sm">
            <div className="text-xs text-gray-400">สั่งวันนี้</div>
            <div className="text-base font-bold text-blue-500">{orderedToday}</div>
            <div className="text-xs text-gray-400 mt-1">ค้างรับ</div>
            <div className="text-base font-bold text-orange-500">{pendingTotal}</div>
          </div>
          <div className="bg-white rounded-xl p-2 shadow-sm">
            <div className="text-xs text-gray-400">COD ค้าง</div>
            <div className="text-sm font-bold text-indigo-500">{codTotal.toFixed(0)}฿</div>
          </div>
          <div className="bg-white rounded-xl p-2 shadow-sm">
            <div className="text-xs text-gray-400">รับวันนี้</div>
            <div className="text-base font-bold text-green-500">{receivedToday}</div>
          </div>
          <div className={`rounded-xl p-2 shadow-sm ${overdueCount > 0 ? 'bg-red-50' : 'bg-white'}`}>
            <div className="text-xs text-gray-400">ค้าง 7วัน</div>
            <div className={`text-base font-bold ${overdueCount > 0 ? 'text-red-500' : 'text-gray-800'}`}>{overdueCount}</div>
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
            💵 ค่ากด
          </button>
        </div>

        {/* Tab: พัสดุ */}
        {activeTab === 'parcels' && (
          <div>
            {/* Search */}
            <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2 text-sm"
                placeholder="🔍 ค้นหาชื่อพัสดุ / เลขพัสดุ..." />
            </div>

            {/* Status Filter */}
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

            {/* List */}
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
                            {r.platforms?.name} · {new Date(r.order_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
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
          </div>
        )}

        {/* Tab: ค่ากด */}
        {activeTab === 'fees' && (
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
              const fees = calcDailyFees()
              const grandTotal = fees.reduce((s, op) => s + op.total, 0)

              if (fees.length === 0) return (
                <div className="text-center text-gray-400 py-12">
                  <div className="text-4xl mb-2">💵</div>
                  <p>ไม่มีข้อมูลค่ะ</p>
                </div>
              )

              return (
                <div className="space-y-3">
                  {fees.map((op, i) => (
                    <div key={i} className="bg-white rounded-2xl p-4 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <div className="font-bold text-gray-800">👤 {op.name}</div>
                        <div className="text-sm text-gray-500">{op.byCoupon.reduce((s, c) => s + c.count, 0)} บิล</div>
                      </div>
                      <div className="space-y-1 mb-3">
                        {op.byCoupon.map((c, j) => (
                          <div key={j} className="flex justify-between text-sm">
                            <span className="text-gray-500">{c.couponName} (ค่ากด {c.fee}฿) × {c.count} บิล</span>
                            <span className="font-medium">{(c.fee * c.count).toLocaleString()}฿</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between font-bold pt-2 border-t border-gray-100">
                        <span>รวม</span>
                        <span className="text-indigo-600">{op.total.toLocaleString()}฿</span>
                      </div>
                    </div>
                  ))}
                  <div className="bg-indigo-50 rounded-2xl p-4 shadow-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-indigo-700">💵 รวมค่ากดทั้งวัน</span>
                      <span className="text-2xl font-bold text-indigo-600">{grandTotal.toLocaleString()}฿</span>
                    </div>
                    <div className="text-xs text-indigo-400 mt-1">
                      {new Date(feeDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Detail Modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">รายละเอียดพัสดุ</h3>
                <button onClick={() => setSelected(null)} className="text-gray-400 text-xl">✕</button>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ชื่อที่สั่ง</span>
                  <span className="font-bold">{selected.order_name || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">แพลตฟอร์ม</span>
                  <span>{selected.platforms?.name || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">คนกด</span>
                  <span>{selected.operators?.name || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">คูปอง</span>
                  <span>{selected.coupons?.name || '-'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">วันที่สั่ง</span>
                  <span>{new Date(selected.order_date).toLocaleDateString('th-TH')}</span>
                </div>
              </div>

              <div className="mb-3">
                <h4 className="font-bold text-sm text-gray-700 mb-2">รายการสินค้า (เช็คของ)</h4>
                <div className="space-y-2">
                  {selected.stock_receipt_items.map(item => (
                    <div key={item.id} className="bg-gray-50 rounded-xl p-2 flex gap-2 items-center">
                      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.products?.image_url ? (
                          <img src={item.products.image_url} className="w-full h-full object-contain p-1" />
                        ) : <span className="text-xl">🐱</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium line-clamp-1">{item.products?.name || 'สินค้าถูกลบ'}</div>
                        <div className="text-xs text-gray-400">ราคา {item.original_price.toFixed(2)}฿</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-indigo-600">{item.quantity}</div>
                        <div className="text-xs text-gray-400">{item.products?.unit}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 mb-3 flex justify-between items-center">
                <span className="font-bold text-indigo-700">💰 ยอด COD ปลายทาง</span>
                <span className="text-2xl font-bold text-indigo-600">{getCOD(selected).toFixed(2)}฿</span>
              </div>

              {selected.note && (
                <div className="bg-yellow-50 rounded-xl p-3 mb-3">
                  <div className="text-xs text-yellow-700 font-bold mb-1">หมายเหตุ</div>
                  <div className="text-sm">{selected.note}</div>
                </div>
              )}

              {selected.problem_note && (
                <div className="bg-red-50 rounded-xl p-3 mb-3">
                  <div className="text-xs text-red-700 font-bold mb-1">⚠️ ปัญหาที่พบ</div>
                  <div className="text-sm">{selected.problem_note}</div>
                </div>
              )}

              <button onClick={() => openEdit(selected)}
  className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl mb-2">
  ✏️ แก้ไขข้อมูล
</button>
              <div className="space-y-2">
                {selected.status === 'pending' && (
                  <>
                <button onClick={() => confirmReceive(selected)} disabled={saving}
                  className="w-full bg-green-500 text-white font-bold py-3 rounded-2xl disabled:opacity-50">
                  {saving ? 'กำลังบันทึก...' : '✅ ยืนยันรับสินค้า (เข้าสต็อก)'}
                </button>
                    <button onClick={() => { setShowProblemDialog(true); setProblemNote('') }}
                      className="w-full bg-red-100 text-red-600 font-bold py-3 rounded-2xl">
                      ⚠️ สินค้ามีปัญหา
                    </button>
                  </>
                )}
                {selected.status !== 'pending' && (
                  <button onClick={() => revertStatus(selected)}
                    className="w-full bg-yellow-100 text-yellow-700 font-bold py-3 rounded-2xl">
                    ↩️ ย้อนสถานะกลับ "กำลังมา"
                  </button>
                )}
                <button onClick={() => deleteReceipt(selected.id, selected.order_name)}
                  className="w-full bg-red-100 text-red-600 font-bold py-3 rounded-2xl">
                  🗑️ ลบออเดอร์นี้
                </button>
              </div>
            </div>
          </div>
        )}

{/* Edit Modal */}
{showEdit && selected && (
  <div className="fixed inset-0 bg-black/50 z-[60] flex items-end">
    <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg">✏️ แก้ไขออเดอร์</h3>
        <button onClick={() => setShowEdit(false)} className="text-gray-400 text-xl">✕</button>
      </div>

      <div className="space-y-3">

        {/* วันที่ */}
        <div>
          <label className="text-xs text-gray-500">วันที่สั่ง</label>
          <input type="date" value={editForm.order_date}
            onChange={e => setEditForm({...editForm, order_date: e.target.value})}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
        </div>

        {/* แพลตฟอร์ม + คนกด */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">แพลตฟอร์ม</label>
            <select value={editForm.platform_id}
              onChange={e => setEditForm({...editForm, platform_id: e.target.value})}
              className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
              <option value="">เลือก</option>
              {receipts.reduce((acc: string[], r) => {
                if (r.platforms?.name && !acc.includes(r.platforms.name)) acc.push(r.platforms.name)
                return acc
              }, []).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">คนกด</label>
            <select value={editForm.operator_id}
              onChange={e => setEditForm({...editForm, operator_id: e.target.value})}
              className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
              <option value="">เลือก</option>
              {receipts.reduce((acc: string[], r) => {
                if (r.operators?.name && !acc.includes(r.operators.name)) acc.push(r.operators.name)
                return acc
              }, []).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ชื่อที่สั่ง */}
        <div>
          <label className="text-xs text-gray-500">ชื่อที่สั่ง</label>
          <input value={editForm.order_name}
            onChange={e => setEditForm({...editForm, order_name: e.target.value})}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            placeholder="ชื่อที่สั่ง" />
        </div>

        {/* คูปอง + ค่ากด */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">คูปอง</label>
            <select value={editForm.coupon_id}
              onChange={e => setEditForm({...editForm, coupon_id: e.target.value})}
              className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
              <option value="">เลือก</option>
              {receipts.reduce((acc: string[], r) => {
                if (r.coupons?.name && !acc.includes(r.coupons.name)) acc.push(r.coupons.name)
                return acc
              }, []).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">ค่ากด (฿)</label>
            <input type="number" value={editForm.service_fee_actual}
              onChange={e => setEditForm({...editForm, service_fee_actual: Number(e.target.value)})}
              className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
          </div>
        </div>

        {/* เลขพัสดุ */}
        <div>
          <label className="text-xs text-gray-500">เลขพัสดุ</label>
          <input value={editForm.tracking_no}
            onChange={e => setEditForm({...editForm, tracking_no: e.target.value})}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            placeholder="เลขพัสดุ (ถ้ามี)" />
        </div>

        {/* รายการสินค้า */}
        <div>
          <h4 className="font-bold text-sm text-gray-700 mb-2">รายการสินค้า</h4>
          <div className="space-y-2">
            {editItems.map((item, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-3">
                <div className="flex gap-2 items-center mb-2">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                    {item.product_image ? (
                      <img src={item.product_image} className="w-full h-full object-contain p-1" />
                    ) : <span>🐱</span>}
                  </div>
                  <div className="flex-1 text-sm font-medium line-clamp-1">{item.product_name}</div>
                  <button onClick={() => setEditItems(editItems.filter((_, i) => i !== index))}
                    className="text-red-400 text-xs">ลบ</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">จำนวน</label>
                    <input type="number" value={item.quantity}
                      onChange={e => {
                        const updated = [...editItems]
                        updated[index] = {...updated[index], quantity: Number(e.target.value)}
                        setEditItems(updated)
                      }}
                      className="w-full border border-gray-200 rounded-lg p-1.5 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">ราคารวม (฿)</label>
                    <input type="number" step="0.01" value={item.original_price}
                      onChange={e => {
                        const updated = [...editItems]
                        updated[index] = {...updated[index], original_price: Number(e.target.value)}
                        setEditItems(updated)
                      }}
                      className="w-full border border-gray-200 rounded-lg p-1.5 text-sm mt-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* หมายเหตุ */}
        <div>
          <label className="text-xs text-gray-500">หมายเหตุ</label>
          <textarea value={editForm.note}
            onChange={e => setEditForm({...editForm, note: e.target.value})}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            rows={2} placeholder="หมายเหตุเพิ่มเติม" />
        </div>

      </div>

      <button onClick={handleSaveEdit} disabled={saving}
        className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
        {saving ? 'กำลังบันทึก...' : '✅ บันทึกการแก้ไข'}
      </button>
    </div>
  </div>
)}

{/* Confirm Receive Dialog */}
{showConfirmReceive && selected && (
  <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
      <h3 className="font-bold mb-1">✅ ยืนยันรับสินค้า</h3>
      <p className="text-sm text-gray-500 mb-3">{selected.order_name || 'ไม่ระบุชื่อ'}</p>

      <div className="bg-gray-50 rounded-xl p-3 mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-500">COD ที่คำนวณได้</span>
          <span>{getCOD(selected).toFixed(2)}฿</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span className="text-gray-700">ขนส่งเก็บจริง</span>
          <span className="text-indigo-600">{actualCOD.toFixed(2)}฿</span>
        </div>
        {Math.abs(actualCOD - getCOD(selected)) > 0.01 && (
          <div className="text-xs text-orange-500 mt-1">
            ส่วนต่าง {(actualCOD - getCOD(selected)).toFixed(2)}฿
          </div>
        )}
      </div>

      <div className="mb-3">
        <label className="text-xs text-gray-500">ยอดที่จ่ายจริง (฿)</label>
        <input type="number" step="0.01" value={actualCOD}
          onChange={e => setActualCOD(Number(e.target.value))}
          className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
          autoFocus />
        <div className="flex gap-2 mt-2">
          <button onClick={() => setActualCOD(Math.ceil(getCOD(selected)))}
            className="flex-1 bg-gray-100 text-gray-600 py-1.5 rounded-lg text-xs">
            ปัดขึ้น {Math.ceil(getCOD(selected))}฿
          </button>
          <button onClick={() => setActualCOD(getCOD(selected))}
            className="flex-1 bg-gray-100 text-gray-600 py-1.5 rounded-lg text-xs">
            ตามระบบ {getCOD(selected).toFixed(2)}฿
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setShowConfirmReceive(false)}
          className="bg-gray-100 text-gray-600 py-2 rounded-xl">ยกเลิก</button>
        <button onClick={() => {
          setShowConfirmReceive(false)
          doConfirmReceive(selected, actualCOD)
        }} disabled={saving}
          className="bg-green-500 text-white py-2 rounded-xl font-bold disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'ยืนยัน'}
        </button>
      </div>
    </div>
  </div>
)}

        {/* Problem Dialog */}
        {showProblemDialog && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
              <h3 className="font-bold mb-3">⚠️ สินค้ามีปัญหา</h3>
              <label className="text-xs text-gray-500">รายละเอียดปัญหา</label>
              <textarea value={problemNote} onChange={e => setProblemNote(e.target.value)}
                autoFocus rows={3}
                className="w-full border border-gray-200 rounded-xl p-2 text-sm mt-1 mb-3"
                placeholder="เช่น กล่องบุบ, ของไม่ครบ, สินค้าเสียหาย..." />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowProblemDialog(false)}
                  className="bg-gray-100 text-gray-600 py-2 rounded-xl">ยกเลิก</button>
                <button onClick={markProblem} disabled={!problemNote.trim() || saving}
                  className="bg-red-500 text-white py-2 rounded-xl disabled:opacity-50">บันทึก</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}