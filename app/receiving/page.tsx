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

// ─── วิธีชำระเงิน ───
type PaymentMethod = 'cod' | 'promptpay' | 'installment'
type InstallmentType = 'spaylater_dat' | 'spaylater_white'
type OrderFor = 'self' | 'sister'
type FeePayer = 'self' | 'white'

const INSTALLMENT_LABELS: Record<InstallmentType, string> = {
  spaylater_dat: 'SPaylater แดท',
  spaylater_white: 'SPaylater ไวท์',
}

function calcItemCost(price: number, coupon: Coupon): number {
  switch (coupon.discount_type) {
    case 'flat': {
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
  if (fee > 0) return fee
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
  const [couponSelectValue, setCouponSelectValue] = useState<string>('')
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

  // ─── ฟิลด์ใหม่ ───
  const [orderFor, setOrderFor] = useState<OrderFor>('self')          // ของใคร
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod')  // วิธีชำระ
  const [installmentType, setInstallmentType] = useState<InstallmentType>('spaylater_dat')
  const [installmentCount, setInstallmentCount] = useState<number>(3)
  const [installmentFirst, setInstallmentFirst] = useState<number>(0)  // ยอดงวดปกติ
  const [installmentLast, setInstallmentLast] = useState<number>(0)    // ยอดงวดสุดท้าย
  const [feePayer, setFeePayer] = useState<FeePayer>('self')           // ใครจ่ายค่ากด

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
        setTimeout(() => {
          setCoupons(curr => {
            const c = curr.find(x => x.id === saved.couponId)
            if (c) { setSelectedCoupon(c); setCouponSelectValue(c.id) }
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
    const totalPrice = currentItems.reduce((sum, i) => sum + i.original_price, 0)
    const actualFee = fee > 0 ? fee : calcServiceFee(coupon, 0)
    const totalCOD = calcItemCost(totalPrice, coupon)
    const updated = currentItems.map(item => {
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
    setCouponSelectValue(coupon.id)
    const defaultFee = calcServiceFee(coupon, 0)
    setManualFee(defaultFee)
    saveDefaults({ couponId: coupon.id })
    recalcItems(items, coupon, defaultFee)
  }

  function selectNoCoupon() {
    setSelectedCoupon(null)
    setCouponSelectValue('none')
    setManualFee(0)
    setItems(prev => prev.map(i => ({
      ...i,
      item_cost: i.original_price,
      service_fee_share: 0,
      unit_cost: i.quantity > 0 ? i.original_price / i.quantity : 0,
    })))
  }

  function handleCouponChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '') {
      setSelectedCoupon(null)
      setCouponSelectValue('')
      setManualFee(0)
    } else if (val === 'none') {
      selectNoCoupon()
    } else {
      const coupon = coupons.find(c => c.id === val)
      if (coupon) selectCoupon(coupon)
    }
  }

  function addProduct(product: Product) {
    if (items.find(i => i.product_id === product.id)) {
      setShowProductSearch(false); setSearchProduct(''); return
    }
    const newItem: ReceiptItem = {
      product_id: product.id, product_name: product.name,
      product_unit: product.unit, product_image: product.image_url,
      quantity: 1, original_price: 0, item_cost: 0, service_fee_share: 0, unit_cost: 0,
    }
    const updated = [...items, newItem]
    setItems(updated)
    if (selectedCoupon) recalcItems(updated, selectedCoupon, manualFee)
    setShowProductSearch(false); setSearchProduct('')
  }

  function updateItem(index: number, field: 'quantity' | 'original_price', value: number) {
    const updated = items.map((item, i) => i === index ? { ...item, [field]: value } : item)
    if (!selectedCoupon) {
      setItems(updated.map(item => ({
        ...item,
        item_cost: item.original_price,
        unit_cost: item.quantity > 0 ? item.original_price / item.quantity : 0,
      })))
    } else {
      setItems(updated)
      recalcItems(updated, selectedCoupon, manualFee)
    }
  }

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index)
    setItems(updated)
    if (selectedCoupon) recalcItems(updated, selectedCoupon, manualFee)
  }

  const totalOriginalPrice = items.reduce((sum, i) => sum + i.original_price, 0)
  const totalItemCost = selectedCoupon
    ? items.reduce((sum, i) => sum + i.item_cost, 0)
    : totalOriginalPrice
  const actualFee = selectedCoupon ? calcServiceFee(selectedCoupon, manualFee) : 0
  const totalCOD = selectedCoupon ? totalItemCost + actualFee : totalOriginalPrice

  // ─── IDs ของ category พิเศษ ───
  const SISTER_CATEGORY_ID = 'ff6cf3f5-db5b-48a4-adce-b1e5057d192b'
  const WHITE_CATEGORY_ID = '61f0acb2-54c7-4dc6-9d0d-c06a50a2522b'

  // ─── สร้างหนี้อัตโนมัติ ───
  async function createDebts(receiptId: string) {
    const dateLabel = new Date(orderDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

    // 1) ของพี่สาว → พี่สาวเป็นหนี้เรา = totalCOD
    if (orderFor === 'sister') {
      const sisterDebtName = `พี่สาวสั่งของ · ${orderName || 'ไม่ระบุชื่อ'} · ${dateLabel}`
      await supabase.from('debts').insert({
        name: sisterDebtName,
        amount: totalCOD,
        paid_amount: 0,
        category: 'พี่สาว',
        debt_category_id: SISTER_CATEGORY_ID,
        status: 'unpaid',
        note: `receipt_id:${receiptId}`,
        receipt_id: receiptId,
        debtor: 'พี่สาว',
        creditor: 'เรา',
        has_installments: false,
      })
    }

    // 2) ไวท์จ่ายค่ากด → เราเป็นหนี้ไวท์ = service_fee
    if (feePayer === 'white' && actualFee > 0) {
      await supabase.from('debts').insert({
        name: `ค่ากด · ${orderName || 'ไม่ระบุชื่อ'} · ${dateLabel}`,
        amount: actualFee,
        paid_amount: 0,
        category: 'หนี้ไวท์',
        debt_category_id: WHITE_CATEGORY_ID,
        status: 'unpaid',
        note: `receipt_id:${receiptId}`,
        receipt_id: receiptId,
        debtor: 'เรา',
        creditor: 'ไวท์',
        fee_payer: 'white',
        has_installments: false,
      })
    }

    // 3) ผ่อน → สร้างหนี้แบบผ่อน + สร้าง installments
    if (paymentMethod === 'installment') {
      const label = INSTALLMENT_LABELS[installmentType]
      const instCategoryId = installmentType === 'spaylater_white' ? WHITE_CATEGORY_ID : null
      const { data: debt } = await supabase.from('debts').insert({
        name: `ผ่อน ${label} · ${orderName || 'ไม่ระบุชื่อ'}`,
        amount: totalCOD,
        paid_amount: 0,
        category: label,
        debt_category_id: instCategoryId,
        status: 'unpaid',
        note: `receipt_id:${receiptId}`,
        receipt_id: receiptId,
        debtor: 'เรา',
        creditor: installmentType === 'spaylater_white' ? 'ไวท์' : 'แดท',
        has_installments: true,
        total_installments: installmentCount,
      }).select().single()

      if (debt && installmentFirst > 0) {
        const installments = Array.from({ length: installmentCount }, (_, i) => {
          const dueDate = new Date(orderDate)
          dueDate.setMonth(dueDate.getMonth() + i)
          const isLast = i === installmentCount - 1
          return {
            debt_id: debt.id,
            installment_no: i + 1,
            amount: isLast && installmentLast > 0 ? installmentLast : installmentFirst,
            due_date: dueDate.toISOString().split('T')[0],
            paid: false,
          }
        })
        await supabase.from('debt_installments').insert(installments)
      }
    }
  }

  async function handleSave(continueAdd: boolean = false) {
    if (items.length === 0) return
    setSaving(true)
    try {
      const { data: receipt, error } = await supabase.from('stock_receipts').insert({
        platform_id: platformId || null,
        operator_id: operatorId || null,
        coupon_id: selectedCoupon?.id || null,
        order_name: orderName,
        order_date: orderDate,
        service_fee_actual: actualFee,
        tracking_no: trackingNo || null,
        status: 'pending',
        note,
        // ─── column ใหม่ ───
        order_for: orderFor,
        payment_method: paymentMethod,
        installment_type: paymentMethod === 'installment' ? installmentType : null,
        installment_count: paymentMethod === 'installment' ? installmentCount : null,
        installment_first: paymentMethod === 'installment' ? installmentFirst : null,
        installment_last: paymentMethod === 'installment' && installmentLast > 0 ? installmentLast : null,
        fee_payer: feePayer,
      }).select().single()

      if (error) throw error

      await supabase.from('stock_receipt_items').insert(
        items.map(item => ({
          receipt_id: receipt.id,
          product_id: item.product_id,
          quantity: item.quantity,
          original_price: item.original_price,
          item_cost: selectedCoupon ? item.item_cost : item.original_price,
          service_fee_share: item.service_fee_share,
          unit_cost: selectedCoupon ? item.unit_cost : (item.quantity > 0 ? item.original_price / item.quantity : 0),
        }))
      )

// สร้าง stock lots สำหรับ FIFO
const platformName = platforms.find(p => p.id === platformId)?.name || null
for (const item of items) {
  await supabase.from('stock_lots').insert({
    product_id: item.product_id,
    receipt_id: receipt.id,
    platform_name: platformName,
    quantity_in: item.quantity,
    quantity_remaining: item.quantity,
    order_date: orderDate,
  })
}

      // สร้างหนี้อัตโนมัติ
      await createDebts(receipt.id)

      setOrderName(''); setNote(''); setItems([])
      setOrderFor('self'); setPaymentMethod('cod'); setFeePayer('self')
      setInstallmentFirst(0); setInstallmentLast(0); setInstallmentCount(3)

      if (continueAdd) {
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
    <main className="min-h-screen bg-[#fff5f3] p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">📦 สั่งออเดอร์</h1>
        </div>

        {/* ─── ข้อมูลการสั่ง ─── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <h2 className="font-bold text-gray-700 mb-3">ข้อมูลการสั่ง</h2>
          <div className="space-y-3">

            <div>
              <label className="text-xs text-gray-500">วันที่สั่ง</label>
              <input type="date" value={orderDate}
                onChange={e => { setOrderDate(e.target.value); saveDefaults({ orderDate: e.target.value }) }}
                className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">แพลตฟอร์ม</label>
                <select value={platformId}
                  onChange={e => { setPlatformId(e.target.value); setSelectedCoupon(null); setCouponSelectValue(''); saveDefaults({ platformId: e.target.value }) }}
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

            <div>
              <label className="text-xs text-gray-500">ชื่อที่สั่ง</label>
              <input value={orderName} onChange={e => setOrderName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                placeholder="ชื่อที่สั่ง" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">คูปอง</label>
                <select
                  value={couponSelectValue}
                  onChange={handleCouponChange}
                  className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                  <option value="">เลือกคูปอง</option>
                  <option value="none">🛒 ไม่มีคูปอง / สั่งเอง</option>
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
                  className={`w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm ${!selectedCoupon ? 'bg-gray-50 text-gray-400' : ''}`}
                  placeholder="0"
                />
              </div>
            </div>

            {couponSelectValue === 'none' && (
              <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-600 font-semibold">
                🛒 สั่งเอง — ไม่มีคูปอง ไม่มีค่ากดค่ะ
              </div>
            )}

          </div>
        </div>

        {/* ─── รายการสินค้า ─── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-gray-700">รายการสินค้า</h2>
            <button onClick={() => setShowProductSearch(true)}
              className="bg-gradient-to-r from-orange-400 to-rose-400 text-white text-sm px-3 py-1 rounded-xl">
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
                      {p.image_url ? <img src={p.image_url} className="w-full h-full object-contain p-1" /> : <span>🐱</span>}
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
                      {item.product_image ? <img src={item.product_image} className="w-full h-full object-contain p-1" /> : <span className="text-xl">🐱</span>}
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
                  {item.original_price > 0 && item.quantity > 0 && (
                    <div className="mt-2 text-xs text-rose-400">
                      ต้นทุน/ชิ้น: {selectedCoupon
                        ? item.unit_cost.toFixed(2)
                        : (item.original_price / item.quantity).toFixed(2)}฿
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>


        {/* ─── ส่วนที่ 1: ของใคร ─── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <h2 className="font-bold text-gray-700 mb-3">👤 ของใคร</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOrderFor('self')}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${orderFor === 'self' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-gray-50 text-gray-500'}`}>
              🐱 ของเรา
            </button>
            <button
              onClick={() => setOrderFor('sister')}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${orderFor === 'sister' ? 'bg-gradient-to-r from-purple-400 to-pink-400 text-white' : 'bg-gray-50 text-gray-500'}`}>
              👩 ของพี่สาว
            </button>
          </div>
          {orderFor === 'sister' && (
            <div className="mt-2 bg-purple-50 rounded-xl px-3 py-2 text-xs text-purple-600 font-semibold">
              💜 ระบบจะสร้างหนี้ "พี่สาวเป็นหนี้เรา" อัตโนมัติค่ะ
            </div>
          )}
        </div>

        {/* ─── ส่วนที่ 2: วิธีชำระเงิน ─── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <h2 className="font-bold text-gray-700 mb-3">💳 วิธีชำระเงิน</h2>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {([
              { key: 'cod', label: '🚪 COD', color: 'from-teal-400 to-teal-500' },
              { key: 'promptpay', label: '📱 พร้อมเพย์', color: 'from-blue-400 to-blue-500' },
              { key: 'installment', label: '📅 ผ่อน', color: 'from-purple-400 to-purple-500' },
            ] as { key: PaymentMethod; label: string; color: string }[]).map(btn => (
              <button key={btn.key}
                onClick={() => setPaymentMethod(btn.key)}
                className={`py-3 rounded-xl text-xs font-bold transition-all ${paymentMethod === btn.key ? `bg-gradient-to-r ${btn.color} text-white` : 'bg-gray-50 text-gray-500'}`}>
                {btn.label}
              </button>
            ))}
          </div>

          {/* ผ่อน — รายละเอียดเพิ่มเติม */}
          {paymentMethod === 'installment' && (
            <div className="space-y-3 bg-purple-50 rounded-xl p-3">
              <div>
                <label className="text-xs text-purple-600 font-semibold">ผ่อนกับ</label>
                <select
                  value={installmentType}
                  onChange={e => setInstallmentType(e.target.value as InstallmentType)}
                  className="w-full border border-purple-200 rounded-xl p-2 mt-1 text-sm bg-white">
                  <option value="spaylater_dat">SPaylater แดท</option>
                  <option value="spaylater_white">SPaylater ไวท์</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-purple-600 font-semibold">จำนวนงวด</label>
                  <input
                    type="number" min="1" value={installmentCount}
                    onChange={e => setInstallmentCount(Number(e.target.value))}
                    className="w-full border border-purple-200 rounded-xl p-2 mt-1 text-sm bg-white text-center" />
                </div>
                <div>
                  <label className="text-xs text-purple-600 font-semibold">ยอดงวดปกติ (฿)</label>
                  <input
                    type="number" step="0.01" value={installmentFirst || ''}
                    onChange={e => setInstallmentFirst(Number(e.target.value))}
                    placeholder="เช่น 128.10"
                    className="w-full border border-purple-200 rounded-xl p-2 mt-1 text-sm bg-white" />
                </div>
                <div>
                  <label className="text-xs text-purple-600 font-semibold">งวดสุดท้าย (฿)</label>
                  <input
                    type="number" step="0.01" value={installmentLast || ''}
                    onChange={e => setInstallmentLast(Number(e.target.value))}
                    placeholder="ถ้าเท่ากันเว้นว่าง"
                    className="w-full border border-purple-200 rounded-xl p-2 mt-1 text-sm bg-white" />
                </div>
              </div>
              {installmentFirst > 0 && installmentCount > 0 && (
                <div className="bg-white rounded-xl p-2 text-xs text-gray-500 space-y-0.5">
                  <div className="font-semibold text-purple-600 mb-1">ตัวอย่างงวด</div>
                  {Array.from({ length: Math.min(3, installmentCount) }, (_, i) => {
                    const d = new Date(orderDate)
                    d.setMonth(d.getMonth() + i)
                    const isLast = i === installmentCount - 1
                    const amt = isLast && installmentLast > 0 ? installmentLast : installmentFirst
                    return (
                      <div key={i}>งวด {i + 1}: {amt.toFixed(2)}฿ · {d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</div>
                    )
                  })}
                  {installmentCount > 3 && <div className="text-gray-400">...</div>}
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'cod' && (
            <div className="bg-teal-50 rounded-xl px-3 py-2 text-xs text-teal-600 font-semibold">
              🚪 จ่ายเงินสดตอนของมาถึงค่ะ
            </div>
          )}
          {paymentMethod === 'promptpay' && (
            <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-600 font-semibold">
              📱 โอนจ่ายล่วงหน้าค่ะ
            </div>
          )}
        </div>

        {/* ─── ส่วนที่ 3: ใครจ่ายค่ากด ─── */}
        {actualFee > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
            <h2 className="font-bold text-gray-700 mb-1">💵 ค่ากด {actualFee.toFixed(2)}฿ — ใครจ่าย?</h2>
            <p className="text-xs text-gray-400 mb-3">ใครจ่ายค่ากดออกไปก่อนค่ะ</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFeePayer('self')}
                className={`py-3 rounded-xl text-sm font-bold transition-all ${feePayer === 'self' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-gray-50 text-gray-500'}`}>
                🐱 เราจ่าย
              </button>
              <button
                onClick={() => setFeePayer('white')}
                className={`py-3 rounded-xl text-sm font-bold transition-all ${feePayer === 'white' ? 'bg-gradient-to-r from-sky-400 to-blue-400 text-white' : 'bg-gray-50 text-gray-500'}`}>
                💙 ไวท์จ่าย
              </button>
            </div>
            {feePayer === 'white' && (
              <div className="mt-2 bg-sky-50 rounded-xl px-3 py-2 text-xs text-sky-600 font-semibold">
                💙 ระบบจะสร้างหนี้ "เราเป็นหนี้ไวท์ {actualFee.toFixed(2)}฿" อัตโนมัติค่ะ
              </div>
            )}
          </div>
        )}



{/* ─── สรุปราคา ─── */}
        {items.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
            <h2 className="font-bold text-gray-700 mb-3">สรุปราคา</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">ราคาสินค้า</span>
                <span>{totalOriginalPrice.toFixed(2)}฿</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ส่วนลด {selectedCoupon ? `(${selectedCoupon.name})` : ''}</span>
                <span className="text-green-500">-{selectedCoupon ? (selectedCoupon.display_value || selectedCoupon.discount_value).toFixed(2) : '0.00'}฿</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">ค่ากด {feePayer === 'white' ? '(ไวท์จ่าย)' : ''}</span>
                <span className={feePayer === 'white' ? 'text-sky-500' : ''}>{actualFee.toFixed(2)}฿</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="text-gray-500">รวมจ่ายปลายทาง</span>
                <span className="text-gray-700">{totalItemCost.toFixed(2)}฿</span>
              </div>
              <div className="flex justify-between font-bold text-xl pt-1">
                <span>ราคาปลายทาง (COD)</span>
                <span className="text-rose-500">{totalCOD.toFixed(2)}฿</span>
              </div>

              {/* สรุปหนี้ที่จะสร้าง */}
              {(orderFor === 'sister' || feePayer === 'white' || paymentMethod === 'installment') && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                  <div className="text-xs text-gray-400 font-semibold mb-1">📋 หนี้ที่จะสร้างอัตโนมัติ</div>
                  {orderFor === 'sister' && (
                    <div className="flex justify-between text-xs bg-purple-50 rounded-lg px-2 py-1.5">
                      <span className="text-purple-600">💜 พี่สาวเป็นหนี้เรา</span>
                      <span className="font-bold text-purple-600">{totalCOD.toFixed(2)}฿</span>
                    </div>
                  )}
                  {feePayer === 'white' && actualFee > 0 && (
                    <div className="flex justify-between text-xs bg-sky-50 rounded-lg px-2 py-1.5">
                      <span className="text-sky-600">💙 เราเป็นหนี้ไวท์ (ค่ากด)</span>
                      <span className="font-bold text-sky-600">{actualFee.toFixed(2)}฿</span>
                    </div>
                  )}
                  {paymentMethod === 'installment' && (
                    <div className="flex justify-between text-xs bg-purple-50 rounded-lg px-2 py-1.5">
                      <span className="text-purple-600">📅 ผ่อน {INSTALLMENT_LABELS[installmentType]} {installmentCount} งวด</span>
                      <span className="font-bold text-purple-600">{totalCOD.toFixed(2)}฿</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── หมายเหตุ ─── */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <label className="text-xs text-gray-500">หมายเหตุ</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            rows={2} placeholder="หมายเหตุเพิ่มเติม" />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-8">
          <button onClick={() => handleSave(false)} disabled={saving || items.length === 0}
            className="bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl disabled:opacity-50 text-sm">
            {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving || items.length === 0}
            className="bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold py-3 rounded-2xl disabled:opacity-50 text-sm">
            {saving ? 'กำลังบันทึก...' : '⚡ บันทึก + บิลใหม่'}
          </button>
        </div>

      </div>
    </main>
  )
}