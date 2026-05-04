'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Coupon = {
  id: string
  name: string
  discount_type: string
  discount_value: number
  display_value: number | null
  max_discount: number | null
  min_purchase: number
  service_fee_formula: string
  service_fee: number | null
  platform_id: string
}

type Platform = { id: string; name: string }
type Operator = { id: string; name: string }
type Product = { id: string; name: string; code: string; unit: string; image_url: string | null }

type ReceiptItem = {
  product_id: string
  product_name: string
  product_unit: string
  product_image: string | null
  quantity: number
  original_price: number
  item_cost: number
  service_fee_share: number
  unit_cost: number
}

function calcItemCost(price: number, coupon: Coupon): number {
  switch (coupon.discount_type) {
    case 'flat': {
      // เช่น คูปอง 165 ลดได้ 165฿ ขั้นต่ำ 1%
      // จ่ายปลายทาง = max(ราคา × ขั้นต่ำ%, ราคา - ลดได้)
      const minPay = price * (coupon.min_purchase / 100)
      const afterDiscount = price - coupon.discount_value
      return Math.max(minPay, afterDiscount)
    }
    case 'percent': {
      const minPay = price * (coupon.min_purchase / 100)
      const discount = price * (coupon.discount_value / 100)
      const afterDiscount = price - discount
      return Math.max(minPay, afterDiscount)
    }
    case 'fixed':
      return coupon.discount_value
    case 'percent_cap': {
      const discount = price * coupon.discount_value / 100
      const actualDiscount = coupon.max_discount ? Math.min(discount, coupon.max_discount) : discount
      return Math.max(0, price - actualDiscount)
    }
    default:
      return price
  }
}

function calcServiceFee(coupon: Coupon, fee: number): number {
  // ถ้า fee > 0 แสดงว่ากรอกเองแล้ว ใช้ค่านั้นเลย
  if (fee > 0) return fee
  // ไม่งั้นใช้ค่า default ตามคูปอง
  switch (coupon.service_fee_formula) {
    case 'fixed': return coupon.service_fee || 0
    case 'half': return coupon.discount_value / 2
    case 'manual': return 0
    default: return 0
  }
}

const DEFAULTS_KEY = 'order_defaults'

export default function OrderPage() {
  const router = useRouter()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [operators, setOperators] = useState<Operator[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null)
  const [manualFee, setManualFee] = useState<number>(0)
  const [platformId, setPlatformId] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [orderName, setOrderName] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [trackingNo, setTrackingNo] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<ReceiptItem[]>([])
  const [searchProduct, setSearchProduct] = useState('')
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [saving, setSaving] = useState(false)

  const filteredCoupons = coupons.filter(c => !platformId || c.platform_id === platformId)

  useEffect(() => {
    fetchData()
    loadDefaults()
  }, [])

  async function fetchData() {
    const [{ data: c }, { data: p }, { data: o }, { data: pr }] = await Promise.all([
      supabase.from('coupons').select('*').eq('is_active', true),
      supabase.from('platforms').select('*'),
      supabase.from('operators').select('*'),
      supabase.from('products').select('id, name, code, unit, image_url').eq('is_active', true),
    ])
    setCoupons(c || [])
    setPlatforms(p || [])
    setOperators(o || [])
    setProducts(pr || [])
  }

  function loadDefaults() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DEFAULTS_KEY) || '{}')
      if (saved.platformId) setPlatformId(saved.platformId)
      if (saved.operatorId) setOperatorId(saved.operatorId)
      if (saved.orderDate) setOrderDate(saved.orderDate)
      if (saved.couponId) {
        // load coupon ตอน coupons โหลดเสร็จ
        setTimeout(() => {
          setCoupons(curr => {
            const c = curr.find(x => x.id === saved.couponId)
            if (c) setSelectedCoupon(c)
            return curr
          })
        }, 100)
      }
    } catch (e) {}
  }

  function saveDefaults(updates: Partial<{ platformId: string; operatorId: string; orderDate: string; couponId: string }>) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(DEFAULTS_KEY) || '{}')
      sessionStorage.setItem(DEFAULTS_KEY, JSON.stringify({ ...saved, ...updates }))
    } catch (e) {}
  }

function recalcItems(currentItems: ReceiptItem[], coupon: Coupon, fee: number) {
  // รวมราคาทั้งบิลก่อน
  const totalPrice = currentItems.reduce((sum, i) => sum + i.original_price, 0)
  const actualFee = fee > 0 ? fee : calcServiceFee(coupon, 0)

  // คิด COD จากราคารวมทั้งบิล
  const totalCOD = calcItemCost(totalPrice, coupon)

  const updated = currentItems.map(item => {
    // แบ่ง COD ตามสัดส่วนราคาสินค้า
    const ratio = totalPrice > 0 ? item.original_price / totalPrice : 0
    const itemCost = totalCOD * ratio
    const feeShare = totalPrice > 0 ? (item.original_price / totalPrice) * actualFee : 0
    const unitCost = item.quantity > 0 ? (itemCost + feeShare) / item.quantity : 0
    return { ...item, item_cost: itemCost, service_fee_share: feeShare, unit_cost: unitCost }
  })
  setItems(updated)
}

function selectCoupon(coupon: Coupon) {
  setSelectedCoupon(coupon)
  // set ค่า default ของค่ากดตามคูปอง
  const defaultFee = calcServiceFee(coupon, 0)
  setManualFee(defaultFee)
  saveDefaults({ couponId: coupon.id })
  recalcItems(items, coupon, defaultFee)
}

  function addProduct(product: Product) {
    if (items.find(i => i.product_id === product.id)) {
      setShowProductSearch(false)
      setSearchProduct('')
      return
    }
    const newItem: ReceiptItem = {
      product_id: product.id,
      product_name: product.name,
      product_unit: product.unit,
      product_image: product.image_url,
      quantity: 1,
      original_price: 0,
      item_cost: 0,
      service_fee_share: 0,
      unit_cost: 0,
    }
    const updated = [...items, newItem]
    setItems(updated)
    if (selectedCoupon) recalcItems(updated, selectedCoupon, manualFee)
    setShowProductSearch(false)
    setSearchProduct('')
  }

  function updateItem(index: number, field: 'quantity' | 'original_price', value: number) {
    const updated = items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    setItems(updated)
    if (selectedCoupon) recalcItems(updated, selectedCoupon, manualFee)
  }

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index)
    setItems(updated)
    if (selectedCoupon) recalcItems(updated, selectedCoupon, manualFee)
  }

  // ราคาสินค้ารวม = ดึงราคามาเลย ไม่ × จำนวน
  const totalOriginalPrice = items.reduce((sum, i) => sum + i.original_price, 0)
  const totalItemCost = items.reduce((sum, i) => sum + i.item_cost, 0)
  const actualFee = selectedCoupon ? calcServiceFee(selectedCoupon, manualFee) : 0
  const totalCOD = totalItemCost + actualFee

async function handleSave(continueAdd: boolean = false) {
  if (!selectedCoupon || items.length === 0) return
  setSaving(true)
    try {
      const { data: receipt, error } = await supabase
        .from('stock_receipts')
        .insert({
          platform_id: platformId || null,
          operator_id: operatorId || null,
          coupon_id: selectedCoupon.id,
          order_name: orderName,
          order_date: orderDate,
          service_fee_actual: actualFee,
          tracking_no: trackingNo || null,
          status: 'pending',
          note,
        })
        .select()
        .single()

      if (error) throw error

      await supabase.from('stock_receipt_items').insert(
        items.map(item => ({
          receipt_id: receipt.id,
          product_id: item.product_id,
          quantity: item.quantity,
          original_price: item.original_price,
          item_cost: item.item_cost,
          service_fee_share: item.service_fee_share,
          unit_cost: item.unit_cost,
        }))
      )

      // เก็บ default แต่ล้างชื่อกับสินค้า
// เก็บ default (วันที่/แพลตฟอร์ม/คนกด/คูปอง) แต่ล้างชื่อกับสินค้า
setOrderName('')
setNote('')
setItems([])

if (continueAdd) {
  // เลื่อนขึ้นบน + focus ที่ช่องชื่อ
  window.scrollTo({ top: 0, behavior: 'smooth' })
} else {
  alert('บันทึกการสั่งเรียบร้อยแล้วค่ะ!')
  router.push('/')
}
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setSaving(false)
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.code?.toLowerCase().includes(searchProduct.toLowerCase())
  )

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">📦 สั่งออเดอร์</h1>
        </div>

        {/* ข้อมูลการสั่ง */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <h2 className="font-bold text-gray-700 mb-3">ข้อมูลการสั่ง</h2>
          <div className="space-y-3">

            {/* วันที่ */}
            <div>
              <label className="text-xs text-gray-500">วันที่สั่ง</label>
              <input type="date" value={orderDate}
                onChange={e => { setOrderDate(e.target.value); saveDefaults({ orderDate: e.target.value }) }}
                className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
            </div>

            {/* แพลตฟอร์ม + คนกด */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">แพลตฟอร์ม</label>
                <select value={platformId}
                  onChange={e => { setPlatformId(e.target.value); setSelectedCoupon(null); saveDefaults({ platformId: e.target.value }) }}
                  className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                  <option value="">เลือก</option>
                  {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">คนกด</label>
                <select value={operatorId}
                  onChange={e => { setOperatorId(e.target.value); saveDefaults({ operatorId: e.target.value }) }}
                  className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                  <option value="">เลือก</option>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>

            {/* ชื่อที่สั่ง */}
            <div>
              <label className="text-xs text-gray-500">ชื่อที่สั่ง</label>
              <input value={orderName} onChange={e => setOrderName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                placeholder="ชื่อที่สั่ง" />
            </div>

            {/* คูปอง + ค่ากด */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">คูปอง</label>
                <select value={selectedCoupon?.id || ''}
                  onChange={e => {
                    const coupon = coupons.find(c => c.id === e.target.value)
                    if (coupon) selectCoupon(coupon)
                  }}
                  className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                  <option value="">เลือกคูปอง</option>
                  {filteredCoupons.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">ค่ากด (฿)</label>
<input
  type="number"
  value={manualFee}
  onChange={e => {
    const fee = Number(e.target.value)
    setManualFee(fee)
    if (selectedCoupon) recalcItems(items, selectedCoupon, fee)
  }}
  disabled={!selectedCoupon}
  className={`w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm ${
    !selectedCoupon ? 'bg-gray-50 text-gray-400' : ''
  }`}
  placeholder="0"
/>
              </div>
            </div>

          </div>
        </div>

        {/* สินค้า */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-gray-700">รายการสินค้า</h2>
            <button onClick={() => setShowProductSearch(true)}
              className="bg-indigo-500 text-white text-sm px-3 py-1 rounded-xl">
              + เพิ่มสินค้า
            </button>
          </div>

          {showProductSearch && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
              <div className="bg-white w-full rounded-t-2xl p-4 max-h-96 overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold">ค้นหาสินค้า</h3>
                  <button onClick={() => setShowProductSearch(false)} className="text-gray-400">✕</button>
                </div>
                <input autoFocus value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2 mb-3 text-sm"
                  placeholder="ค้นหาชื่อหรือรหัสสินค้า..." />
                {filteredProducts.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-4">ไม่พบสินค้าค่ะ</p>
                ) : filteredProducts.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="w-full text-left p-3 border-b border-gray-100 hover:bg-gray-50 flex gap-2 items-center">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.image_url ? (
                        <img src={p.image_url} className="w-full h-full object-contain p-1" />
                      ) : <span>🐱</span>}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.code} · {p.unit}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีสินค้า กด + เพิ่มสินค้าค่ะ</p>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={item.product_id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex gap-2 items-start mb-2">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                      {item.product_image ? (
                        <img src={item.product_image} className="w-full h-full object-contain p-1" />
                      ) : <span className="text-xl">🐱</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm line-clamp-1">{item.product_name}</div>
                    </div>
                    <button onClick={() => removeItem(index)} className="text-red-400 text-xs">ลบ</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">จำนวน ({item.product_unit})</label>
                      <input type="number" value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-lg p-1 text-sm mt-1" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">ราคารวม (฿)</label>
                      <input type="number" step="0.01" value={item.original_price}
                        onChange={e => updateItem(index, 'original_price', Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-lg p-1 text-sm mt-1" />
                    </div>
                  </div>
                  {selectedCoupon && item.original_price > 0 && (
                    <div className="mt-2 text-xs text-indigo-500">
                      ต้นทุน/ชิ้น: {item.unit_cost.toFixed(2)}฿
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

{/* สรุปราคา */}
{items.length > 0 && selectedCoupon && (
  <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
    <h2 className="font-bold text-gray-700 mb-3">สรุปราคา</h2>
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-gray-500">ราคาสินค้า</span>
        <span>{totalOriginalPrice.toFixed(2)}฿</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">ส่วนลด ({selectedCoupon.name})</span>
        <span className="text-green-500">-{(selectedCoupon.display_value || selectedCoupon.discount_value).toFixed(2)}฿</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">ค่ากดของ</span>
        <span>{actualFee.toFixed(2)}฿</span>
      </div>

      <div className="flex justify-between">
        <span className="text-gray-500">รวมจ่ายปลายทาง</span>
        <span>{totalCOD.toFixed(2)}฿</span>
      </div>


          <div className="flex justify-between font-bold text-xl border-t border-gray-100 pt-3 mt-3">
        <span>ราคาปลายทาง</span>
        <span className="text-indigo-600">{totalItemCost.toFixed(2)}฿</span>
      </div>


    </div>
  </div>


)}

        {/* Note */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <label className="text-xs text-gray-500">หมายเหตุ</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            rows={2} placeholder="หมายเหตุเพิ่มเติม" />
        </div>

{/* Save buttons */}
<div className="grid grid-cols-2 gap-2 mb-8">
  <button onClick={() => handleSave(false)}
    disabled={saving || !selectedCoupon || items.length === 0}
    className="bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl disabled:opacity-50 text-sm">
    {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
  </button>
  <button onClick={() => handleSave(true)}
    disabled={saving || !selectedCoupon || items.length === 0}
    className="bg-indigo-500 text-white font-bold py-3 rounded-2xl disabled:opacity-50 text-sm">
    {saving ? 'กำลังบันทึก...' : '⚡ บันทึก + บิลใหม่'}
  </button>
</div>

      </div>
    </main>
  )
}