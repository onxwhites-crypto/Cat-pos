'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type CartItem = {
  product_id: string; name: string; unit: string; quantity: number
  unit_price: number; original_price: number; image_url: string | null
}
type Promotion = {
  id: string; name: string; unit_price: number; dozen_price: number
  dozen_qty: number; is_active: boolean; promotion_products: { product_id: string }[]
}
type Customer = { id: string; name: string; phone: string; zone_id: string; address: string }
type DeliveryRound = { id: string; stock_date: string; delivery_date: string; note: string | null }

export default function CheckoutPage() {
  const router = useRouter()
  const [cart, setCart] = useState<CartItem[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [zones, setZones] = useState<{ id: string; name: string }[]>([])
  const [deliveryRounds, setDeliveryRounds] = useState<DeliveryRound[]>([])

  // Checkout fields
  const [discount, setDiscount] = useState(0)
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('transfer')
  const [note, setNote] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [orderType, setOrderType] = useState<'normal' | 'reservation'>('normal')
  const [scheduledDate, setScheduledDate] = useState('')
  const [customScheduledDate, setCustomScheduledDate] = useState('')
  const [bagCount, setBagCount] = useState(0)

  // UI
  const [showPayment, setShowPayment] = useState(false)
  const [showHoldDialog, setShowHoldDialog] = useState(false)
  const [holdName, setHoldName] = useState('')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSlip, setShowSlip] = useState(false)
  const [slipText, setSlipText] = useState('')
  const [copied, setCopied] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // โหลด cart จาก localStorage
    const saved = localStorage.getItem('pos_cart')
    if (saved) {
      try { setCart(JSON.parse(saved)) } catch {}
    }
    setLoaded(true) 
    fetchData()
  }, [])

  // sync cart กลับ localStorage ทุกครั้งที่เปลี่ยน
  useEffect(() => {
    localStorage.setItem('pos_cart', JSON.stringify(cart))
  }, [cart])

  async function fetchData() {
    const today = new Date().toISOString().split('T')[0]
    const [{ data: c }, { data: z }, { data: promo }, { data: rounds }] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('zones').select('*').order('name'),
      supabase.from('promotions').select('*, promotion_products(product_id)').eq('is_active', true),
      supabase.from('delivery_rounds').select('*').gte('delivery_date', today).order('delivery_date', { ascending: true }),
    ])
    setCustomers(c || [])
    setZones(z || [])
    setPromotions(promo || [])
    setDeliveryRounds(rounds || [])
    if (rounds && rounds.length > 0) setScheduledDate(rounds[0].delivery_date)
  }

  function getPromotion(productId: string): Promotion | null {
    return promotions.find(p => p.promotion_products.some(pp => pp.product_id === productId)) || null
  }

  // ── Totals ──
  const subtotal = cart.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const promoDiscount = promotions.reduce((totalDiscount, promo) => {
    const promoItems = cart.filter(i => promo.promotion_products.some(pp => pp.product_id === i.product_id))
    if (!promoItems.length) return totalDiscount
    const totalQty = promoItems.reduce((sum, i) => sum + i.quantity, 0)
    const normalPrice = promoItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
    const promoPrice = (Math.floor(totalQty / promo.dozen_qty) * promo.dozen_price) + ((totalQty % promo.dozen_qty) * promo.unit_price)
    return totalDiscount + Math.max(0, normalPrice - promoPrice)
  }, 0)
  const total = Math.max(0, subtotal - discount - promoDiscount)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  // ── Cart ops ──
  function updateQty(index: number, qty: number) {
    if (qty <= 0) { setCart(cart.filter((_, i) => i !== index)); return }
    setCart(cart.map((item, i) => i === index ? { ...item, quantity: qty } : item))
  }
  function updatePrice(index: number, price: number) {
    setCart(cart.map((item, i) => i === index ? { ...item, unit_price: price } : item))
  }

  function clearCart() {
    if (!confirm('ล้างตะกร้าทั้งหมด?')) return
    setCart([])
    localStorage.removeItem('pos_cart')
    router.push('/pos')
  }

  // ── Hold ──
  async function handleHold() {
    if (!holdName.trim() || cart.length === 0) return
    await supabase.from('held_orders').insert({
      customer_name: holdName.trim(), customer_id: customerId || null,
      zone_id: zoneId || null, delivery_address: deliveryAddress || null,
      items: cart, total
    })
    setCart([])
    localStorage.removeItem('pos_cart')
    setShowHoldDialog(false)
    alert('พักบิลเรียบร้อยค่ะ!')
    router.push('/pos')
  }

  // ── Add customer ──
  async function handleAddNewCustomer() {
    if (!newCustomerName.trim()) return
    setAddingCustomer(true)
    try {
      const { data: newCustomer } = await supabase.from('customers').insert({
        name: newCustomerName.trim(), phone: newCustomerPhone || null,
        zone_id: zoneId || null, address: deliveryAddress || null,
      }).select().single()
      if (newCustomer) {
        setCustomerId(newCustomer.id)
        setCustomerSearch(newCustomer.name)
        setShowAddCustomer(false)
        setNewCustomerName('')
        setNewCustomerPhone('')
        fetchData()
      }
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setAddingCustomer(false)
  }

  // ── Slip ──
  function generateSlip() {
    const line = '──────────'
    const date = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    const customerName = customerSearch || 'ลูกค้าทั่วไป'
    let text = `🐱 ร้าน Pick a cat.\nวันที่ ${date}\nลูกค้า: ${customerName}\n${line}\n`
    cart.forEach(item => { text += `${item.quantity}  ${item.name}\n${''.padStart(15)}${(item.unit_price * item.quantity).toLocaleString()}฿\n` })
    text += `${line}\n`
    if (discount > 0) text += `ราคารวม         ${subtotal.toLocaleString()}฿\nส่วนลด          -${discount.toLocaleString()}฿\n`
    text += `ยอดสุทธิ        ${total.toLocaleString()}฿\n${line}\n`
    if (orderType === 'reservation') { text += `🏪 ฝากของ (รอแจ้งวันส่ง)\n` }
    else { text += `📅 ส่งวันที่ ${new Date(scheduledDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}\n` }
    if (deliveryAddress) text += `📍 ${deliveryAddress}\n`
    return text
  }

  // ── Checkout ──
  async function handleCheckout() {
    if (cart.length === 0) return
    if (orderType === 'normal' && !scheduledDate) { alert('กรุณาเลือกวันส่งค่ะ'); return }
    setSaving(true)
    try {
      const { data: order, error } = await supabase.from('orders').insert({
        customer_id: customerId || null, subtotal, discount, total,
        payment_method: paymentMethod, payment_status: paymentStatus,
        paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
        note, order_type: orderType,
      }).select().single()
      if (error) throw error

      await supabase.from('order_items').insert(cart.map(item => ({
        order_id: order.id, product_id: item.product_id,
        quantity: item.quantity, unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity
      })))

      if (orderType === 'normal') {
        await supabase.from('deliveries').insert({
          order_id: order.id, zone_id: zoneId || null,
          scheduled_date: scheduledDate === 'custom' ? customScheduledDate : scheduledDate,
          bag_count: bagCount, status: 'pending', note: deliveryAddress || null
        })
        for (const item of cart) {
          const { data: p } = await supabase.from('products').select('stock_qty').eq('id', item.product_id).single()
          if (p) {
            await supabase.from('products').update({ stock_qty: p.stock_qty - item.quantity }).eq('id', item.product_id)
            await supabase.from('stock_movements').insert({
              product_id: item.product_id, type: 'OUT',
              quantity: item.quantity, ref_type: 'order', ref_id: order.id
            })
          }
        }
      }

      const slip = generateSlip()
      setSlipText(slip)
      setShowSlip(true)
      setCart([])
      localStorage.removeItem('pos_cart')
      setShowPayment(false)
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ: ' + (e as any)?.message) }
    setSaving(false)
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))

    if (!loaded) return null 
    
  if (cart.length === 0 && !showSlip) {
    return (
      <main className="min-h-screen bg-[#fff5f3] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3">🛒</div>
          <p className="text-gray-400 mb-4">ตะกร้าว่างค่ะ</p>
          <button onClick={() => router.push('/pos')}
            className="bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold px-6 py-3 rounded-2xl">
            ← กลับไปเลือกสินค้า
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fff5f3] pb-28">

      {/* ══ TOP BAR ══ */}
      <div className="sticky top-0 z-10 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">🧾 สรุปยอด</h1>
          <div className="flex gap-2">
            {/* พักบิล */}
            <button
              onClick={() => setShowHoldDialog(true)}
              disabled={cart.length === 0}
              className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 shadow-sm text-xs font-semibold text-amber-500 disabled:opacity-40 active:scale-95 transition-transform"
            >
              📌 พักบิล
            </button>
            {/* ล้างตะกร้า */}
            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 shadow-sm text-xs font-semibold text-rose-400 disabled:opacity-40 active:scale-95 transition-transform"
            >
              🗑️ ล้างตะกร้า
            </button>
          </div>
        </div>
      </div>

      {/* ══ CART ITEMS ══ */}
      <div className="px-4 pt-2 space-y-2">

        {/* ส่วนลด */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between">
          <span className="text-sm text-gray-500 font-semibold">ส่วนลด (฿)</span>
          <input
            type="number" value={discount}
            onChange={e => setDiscount(Number(e.target.value))}
            className="w-24 text-right bg-gray-50 rounded-xl px-3 py-1.5 text-sm font-bold outline-none"
          />
        </div>

        {/* รายการสินค้า */}
        {cart.map((item, index) => (
          <div key={index} className="bg-white rounded-2xl p-3 shadow-sm flex gap-3">
            {/* รูป */}
            <div className="w-14 h-14 bg-rose-50 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
              {item.image_url
                ? <img src={item.image_url} className="w-full h-full object-contain p-1" />
                : <span className="text-2xl">🐱</span>}
            </div>
            {/* ข้อมูล */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <p className="text-sm font-semibold text-gray-800 line-clamp-2 flex-1 mr-2">{item.name}</p>
                <button onClick={() => setCart(cart.filter((_, i) => i !== index))}
                  className="text-gray-300 text-lg flex-shrink-0 leading-none">✕</button>
              </div>
              {getPromotion(item.product_id) && (
                <p className="text-[10px] text-purple-500 mb-1">🎁 {getPromotion(item.product_id)?.name}</p>
              )}
              {/* จำนวน + ราคา */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => updateQty(index, item.quantity - 1)}
                  className="w-7 h-7 bg-rose-50 rounded-lg text-rose-500 font-bold flex items-center justify-center">−</button>
                <input type="number" value={item.quantity} onChange={e => updateQty(index, Number(e.target.value))}
                  className="w-10 text-center bg-gray-50 rounded-lg py-1 text-sm font-semibold outline-none" />
                <button onClick={() => updateQty(index, item.quantity + 1)}
                  className="w-7 h-7 bg-rose-50 rounded-lg text-rose-500 font-bold flex items-center justify-center">+</button>
                <span className="text-gray-300 text-sm">×</span>
                <input type="number" value={item.unit_price} onChange={e => updatePrice(index, Number(e.target.value))}
                  className="w-16 text-center bg-gray-50 rounded-lg py-1 text-sm font-semibold outline-none" />
                <span className="text-gray-400 text-xs">฿</span>
                <span className="ml-auto text-sm font-bold text-rose-500">
                  {(item.unit_price * item.quantity).toLocaleString()}฿
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* ยอดรวม */}
        <div className="bg-white rounded-2xl px-4 py-4 shadow-sm space-y-1.5">
          <div className="flex justify-between text-sm text-gray-500">
            <span>ราคารวม</span><span>{subtotal.toLocaleString()}฿</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-teal-500">
              <span>ส่วนลด</span><span>-{discount.toLocaleString()}฿</span>
            </div>
          )}
          {promoDiscount > 0 && (
            <div className="flex justify-between text-sm text-purple-500">
              <span>🎁 โปรโมชั่น</span><span>-{promoDiscount.toLocaleString()}฿</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="font-bold text-gray-800">รวมทั้งสิ้น</span>
            <span className="text-2xl font-extrabold text-rose-500">{total.toLocaleString()}฿</span>
          </div>
        </div>
      </div>

      {/* ══ BOTTOM BUTTONS ══ */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#fff5f3]/95 backdrop-blur-sm px-4 py-4 flex gap-3 border-t border-rose-100">
        <button
          onClick={() => router.push('/pos')}
          className="flex-1 bg-white text-gray-600 font-bold py-3.5 rounded-2xl shadow-sm active:scale-95 transition-transform"
        >
          ← ย้อนกลับ
        </button>
        <button
          onClick={() => setShowPayment(true)}
          disabled={cart.length === 0}
          className="flex-2 bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold py-3.5 px-8 rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
        >
          ชำระเงิน →
        </button>
      </div>

      {/* ══ HOLD DIALOG ══ */}
      {showHoldDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-xl">
            <h3 className="font-bold text-gray-800 mb-1">📌 พักบิล</h3>
            <p className="text-xs text-gray-400 mb-3">พักตะกร้า {cartCount} รายการ · {total.toLocaleString()}฿</p>
            <input value={holdName} onChange={e => setHoldName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleHold()}
              autoFocus className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none mb-3 placeholder-gray-300"
              placeholder="ชื่อลูกค้า / ชื่อบิล" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowHoldDialog(false)} className="bg-gray-100 text-gray-500 font-semibold py-3 rounded-2xl text-sm">ยกเลิก</button>
              <button onClick={handleHold} disabled={!holdName.trim()}
                className="bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-50">
                พักบิล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ PAYMENT SHEET ══ */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setShowPayment(false)}>
          <div className="bg-[#fff5f3] w-full rounded-t-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center px-4 py-2">
              <h3 className="font-bold text-lg text-gray-800">💳 ชำระเงิน</h3>
              <button onClick={() => setShowPayment(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="px-4 pb-6 space-y-3">

              {/* ลูกค้า */}
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">ลูกค้า</label>
                  <button onClick={() => setShowAddCustomer(true)} className="text-xs text-rose-400 font-bold">+ เพิ่มใหม่</button>
                </div>
                <input value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setCustomerId('') }}
                  className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="ค้นหาลูกค้า..." />
                {customerSearch && !customerId && filteredCustomers.length > 0 && (
                  <div className="border border-rose-100 rounded-2xl overflow-hidden max-h-36 overflow-y-auto">
                    {filteredCustomers.slice(0, 5).map(c => (
                      <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); if (c.zone_id) setZoneId(c.zone_id); if (c.address) setDeliveryAddress(c.address) }}
                        className="w-full text-left px-3 py-2 border-b border-gray-50 text-sm hover:bg-rose-50">
                        <div className="font-semibold">{c.name}</div>
                        {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
                    className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none" placeholder="📍 ที่อยู่/ห้อง" />
                  <select value={zoneId} onChange={e => setZoneId(e.target.value)}
                    className="bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none">
                    <option value="">โซน (ไม่ระบุ)</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </div>
              </div>

              {/* ประเภทการสั่ง */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2.5">ประเภทการสั่ง</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setOrderType('normal')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all ${orderType === 'normal' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-gray-50 text-gray-500'}`}>
                    🛒 ขายปกติ
                  </button>
                  <button onClick={() => setOrderType('reservation')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all ${orderType === 'reservation' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500 text-white' : 'bg-gray-50 text-gray-500'}`}>
                    🏪 ฝากของ
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {orderType === 'normal' ? '📅 กำหนดวันส่งตามรอบ · ตัด stock ทันที' : '⏳ รอลูกค้าแจ้งกลับ · ยังไม่ตัด stock'}
                </p>
              </div>

              {/* วันส่ง */}
              {orderType === 'normal' && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2.5">📅 วันที่ส่ง</label>
                  {deliveryRounds.length > 0 ? (
                    <div className="space-y-2">
                      <select value={scheduledDate} onChange={e => { setScheduledDate(e.target.value); if (e.target.value !== 'custom') setCustomScheduledDate('') }}
                        className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none">
                        <option value="">-- เลือกรอบลงของ --</option>
                        {deliveryRounds.map(r => (
                          <option key={r.id} value={r.delivery_date}>
                            🛵 {new Date(r.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                            {r.note ? ` — ${r.note}` : ''}
                          </option>
                        ))}
                        <option value="custom">📅 วันอื่น (กำหนดเอง)</option>
                      </select>
                      {scheduledDate === 'custom' && (
                        <input type="date" value={customScheduledDate} onChange={e => setCustomScheduledDate(e.target.value)}
                          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none" />
                      )}
                    </div>
                  ) : (
                    <div>
                      <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                        className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none" />
                      <p className="text-xs text-amber-500 mt-1">⚠️ ยังไม่มีรอบลงของ กรุณาบันทึกในหน้าการเงินก่อนค่ะ</p>
                    </div>
                  )}
                </div>
              )}

              {/* สถานะชำระ */}
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block">สถานะชำระเงิน</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setPaymentStatus('paid')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all ${paymentStatus === 'paid' ? 'bg-teal-500 text-white' : 'bg-gray-50 text-gray-500'}`}>
                    ✅ จ่ายแล้ว
                  </button>
                  <button onClick={() => setPaymentStatus('pending')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all ${paymentStatus === 'pending' ? 'bg-amber-400 text-white' : 'bg-gray-50 text-gray-500'}`}>
                    ⏳ ค้างชำระ
                  </button>
                </div>
                {paymentStatus === 'paid' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setPaymentMethod('cash')}
                      className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${paymentMethod === 'cash' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-gray-50 text-gray-500'}`}>
                      💵 เงินสด
                    </button>
                    <button onClick={() => setPaymentMethod('transfer')}
                      className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${paymentMethod === 'transfer' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-gray-50 text-gray-500'}`}>
                      💳 โอน
                    </button>
                  </div>
                )}
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" placeholder="หมายเหตุ..." />
              </div>

              {/* ยอดสุดท้าย */}
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex justify-between text-sm text-gray-500 mb-1"><span>รายการ</span><span>{cart.length} รายการ</span></div>
                <div className="flex justify-between text-sm text-gray-500 mb-1"><span>ราคารวม</span><span>{subtotal.toLocaleString()}฿</span></div>
                {discount > 0 && <div className="flex justify-between text-sm text-teal-500 mb-1"><span>ส่วนลด</span><span>-{discount.toLocaleString()}฿</span></div>}
                {promoDiscount > 0 && <div className="flex justify-between text-sm text-purple-500 mb-1"><span>🎁 โปรโมชั่น</span><span>-{promoDiscount.toLocaleString()}฿</span></div>}
                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="font-bold text-gray-800">รวมทั้งสิ้น</span>
                  <span className="text-xl font-extrabold text-rose-500">{total.toLocaleString()}฿</span>
                </div>
              </div>

              <button onClick={handleCheckout}
                disabled={saving || (orderType === 'normal' && !scheduledDate) || (scheduledDate === 'custom' && !customScheduledDate)}
                className={`w-full font-bold py-4 rounded-2xl text-white disabled:opacity-50 active:scale-[0.98] transition-all ${orderType === 'reservation' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500' : 'bg-gradient-to-r from-orange-400 to-rose-500'}`}>
                {saving ? 'กำลังบันทึก...' : orderType === 'reservation' ? '🏪 ยืนยันฝากของ' : '✅ ยืนยันการขาย'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ADD CUSTOMER ══ */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-gray-800 mb-3">👤 เพิ่มลูกค้าใหม่</h3>
            <div className="space-y-2">
              <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} autoFocus
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none" placeholder="ชื่อลูกค้า *" />
              <input value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none" placeholder="เบอร์โทร" />
              <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none" placeholder="ที่อยู่/ห้อง" />
              <select value={zoneId} onChange={e => setZoneId(e.target.value)}
                className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none">
                <option value="">โซน (ไม่ระบุ)</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => { setShowAddCustomer(false); setNewCustomerName('') }} className="bg-gray-100 text-gray-600 py-3 rounded-2xl font-semibold">ยกเลิก</button>
              <button onClick={handleAddNewCustomer} disabled={!newCustomerName.trim() || addingCustomer}
                className="bg-gradient-to-r from-orange-400 to-rose-500 text-white py-3 rounded-2xl font-bold disabled:opacity-50">
                {addingCustomer ? 'กำลังบันทึก...' : '✅ เพิ่ม'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SLIP ══ */}
      {showSlip && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg text-gray-800">🧾 สลิปสินค้า</h3>
            </div>
            <div className="bg-[#fff5f3] rounded-2xl p-4 mb-3 font-mono text-xs whitespace-pre-wrap text-gray-700 max-h-64 overflow-y-auto">
              {slipText}
            </div>
            <button onClick={() => { navigator.clipboard.writeText(slipText); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className={`w-full font-bold py-3.5 rounded-2xl transition-all mb-2 ${copied ? 'bg-teal-500 text-white' : 'bg-gradient-to-r from-orange-400 to-rose-500 text-white'}`}>
              {copied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกข้อความ'}
            </button>
            <button onClick={() => { setShowSlip(false); router.push('/pos') }}
              className="w-full bg-gray-100 text-gray-500 font-semibold py-3 rounded-2xl">
              กลับหน้าขายของ
            </button>
          </div>
        </div>
      )}

    </main>
  )
}