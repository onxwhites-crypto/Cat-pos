'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import OrderHistoryPopup from '@/components/OrderHistoryPopup'
import OrderDetailPopup from '@/components/OrderDetailPopup'

type Product = {
  id: string; name: string; code: string; unit: string
  selling_price: number; stock_qty: number; image_url: string | null
  category_id: string; categories: { name: string } | null
}
type Category = { id: string; name: string }
type Promotion = {
  id: string; name: string; unit_price: number; dozen_price: number
  dozen_qty: number; is_active: boolean; promotion_products: { product_id: string }[]
}
type CartItem = {
  product_id: string; name: string; unit: string; quantity: number
  unit_price: number; original_price: number; image_url: string | null
}
type Customer = { id: string; name: string; phone: string; zone_id: string; address: string; location_type: string }
type HeldOrder = {
  id: string; customer_name: string; customer_id: string | null
  zone_id: string | null; delivery_address: string | null
  items: CartItem[]; total: number; created_at: string
}
type DeliveryRound = { id: string; stock_date: string; delivery_date: string; note: string | null }

export default function PosPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [discount, setDiscount] = useState(0)
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showHeldOrders, setShowHeldOrders] = useState(false)
  const [showMemberSearch, setShowMemberSearch] = useState(false)
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([])
  const [holdName, setHoldName] = useState('')
  const [showHoldDialog, setShowHoldDialog] = useState(false)
  const [preorderMode, setPreorderMode] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const scannerRef = useRef<any>(null)

  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('transfer')
  const [note, setNote] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSlip, setShowSlip] = useState(false)
  const [slipText, setSlipText] = useState('')
  const [copied, setCopied] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')
  const [customScheduledDate, setCustomScheduledDate] = useState('')
  const [bagCount, setBagCount] = useState(0)
  const [zones, setZones] = useState<{ id: string; name: string }[]>([])
  const [zoneId, setZoneId] = useState('')
  const [orderType, setOrderType] = useState<'normal' | 'reservation'>('normal')
  const [deliveryRounds, setDeliveryRounds] = useState<DeliveryRound[]>([])
  const [showOrderHistory, setShowOrderHistory] = useState(false)
  const [orderHistory, setOrderHistory] = useState<any[]>([])
  const [historySearch, setHistorySearch] = useState('')
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [editingOrder, setEditingOrder] = useState(false)
  const [editOrderDiscount, setEditOrderDiscount] = useState(0)
  const [editOrderStatus, setEditOrderStatus] = useState('')
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
  const editingId = localStorage.getItem('pos_editing_order_id')
  console.log('editing order id:', editingId) 
  const editingCustomer = localStorage.getItem('pos_editing_customer')
  const editingCustomerId = localStorage.getItem('pos_editing_customer_id')
  if (editingId) {
    setEditingOrderId(editingId)
    setCustomerSearch(editingCustomer || '')
    setCustomerId(editingCustomerId || '')
    localStorage.removeItem('pos_editing_order_id')
    localStorage.removeItem('pos_editing_customer')
    localStorage.removeItem('pos_editing_customer_id')
  }
}, [])

  async function fetchData() {
    const today = new Date().toISOString().split('T')[0]
    const [{ data: p }, { data: cat }, { data: c }, { data: h }, { data: z }, { data: promo }, { data: rounds }] = await Promise.all([
      supabase.from('products').select('*, categories(name)').eq('is_active', true).order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('held_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('zones').select('*').order('name'),
      supabase.from('promotions').select('*, promotion_products(product_id)').eq('is_active', true),
      supabase.from('delivery_rounds').select('*').gte('delivery_date', today).order('delivery_date', { ascending: true }),
    ])
    setProducts(p || []); setCategories(cat || []); setCustomers(c || [])
    setHeldOrders(h || []); setZones(z || []); setPromotions(promo || [])
    setDeliveryRounds(rounds || [])
    if (rounds && rounds.length > 0 && !scheduledDate) {
      setScheduledDate(rounds[0].delivery_date)
    }
  }

  async function startScanner() {
    setShowScanner(true)
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        const scanner = new Html5Qrcode('qr-reader')
        scannerRef.current = scanner
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            const found = products.find(p => p.code === decodedText)
            if (found) { addToCart(found); stopScanner() } else { setSearch(decodedText); stopScanner() }
          }, () => {})
      } catch (e) { stopScanner() }
    }, 100)
  }

  async function stopScanner() {
    try { if (scannerRef.current) { await scannerRef.current.stop(); scannerRef.current = null } } catch (e) {}
    setShowScanner(false)
  }

  function getPromotion(productId: string): Promotion | null {
    return promotions.find(p => p.promotion_products.some(pp => pp.product_id === productId)) || null
  }

function addToCart(product: Product) {
  const existing = cart.find(i => i.product_id === product.id)
  const promo = getPromotion(product.id)
  const unitPrice = promo ? promo.unit_price : product.selling_price
  const currentQty = existing ? existing.quantity : 0

  // ถ้าไม่ได้เปิด preorder และจำนวนในตะกร้าถึง stock แล้ว → หยุด
  if (!preorderMode && currentQty >= product.stock_qty) return

  if (existing) {
    setCart(cart.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1, unit_price: unitPrice } : i))
  } else {
    setCart([...cart, { product_id: product.id, name: product.name, unit: product.unit, quantity: 1, unit_price: unitPrice, original_price: product.selling_price, image_url: product.image_url }])
  }
}

  function updateQty(index: number, qty: number) {
    if (qty <= 0) { removeFromCart(index); return }
    setCart(cart.map((item, i) => i === index ? { ...item, quantity: qty } : item))
  }
  function updatePrice(index: number, price: number) {
    setCart(cart.map((item, i) => i === index ? { ...item, unit_price: price } : item))
  }
  function removeFromCart(index: number) { setCart(cart.filter((_, i) => i !== index)) }

  function clearCart() {
    if (cart.length === 0) return
    if (!confirm('ล้างตะกร้าทั้งหมด?')) return
    setCart([])
  }

  function copyCart() {
    if (cart.length === 0) { alert('ตะกร้าว่างอยู่ค่ะ'); return }
    const line = '──────────'
    const customerName = customerSearch || 'ลูกค้าทั่วไป'
    let text = `ลูกค้า: ${customerName}\n${line}\n`
    cart.forEach(item => { text += `${item.quantity}  ${item.name}\n${''.padStart(15)}${(item.unit_price * item.quantity).toLocaleString()}฿\n` })
    text += `${line}\n`
    if (discount > 0) text += `ส่วนลด          -${discount.toLocaleString()}฿\n`
    if (promoDiscount > 0) text += `โปรโมชั่น       -${promoDiscount.toLocaleString()}฿\n`
    text += `รวม             ${total.toLocaleString()}฿`
    navigator.clipboard.writeText(text)
    alert('คัดลอกแล้วค่ะ!')
  }

  const subtotal = cart.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const promoDiscount = promotions.reduce((totalDiscount, promo) => {
    const promoItems = cart.filter(i => promo.promotion_products.some(pp => pp.product_id === i.product_id))
    if (promoItems.length === 0) return totalDiscount
    const totalQty = promoItems.reduce((sum, i) => sum + i.quantity, 0)
    const normalPrice = promoItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
    const promoPrice = (Math.floor(totalQty / promo.dozen_qty) * promo.dozen_price) + ((totalQty % promo.dozen_qty) * promo.unit_price)
    return totalDiscount + Math.max(0, normalPrice - promoPrice)
  }, 0)
  const total = Math.max(0, subtotal - discount - promoDiscount)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const heldQtyMap: { [productId: string]: number } = {}
  heldOrders.forEach(order => {
    (order.items || []).forEach((item: CartItem) => {
      heldQtyMap[item.product_id] = (heldQtyMap[item.product_id] || 0) + item.quantity
    })
  })

  const filteredProducts = products
    .filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.code?.toLowerCase().includes(search.toLowerCase())
      const matchCategory = !selectedCategory || p.category_id === selectedCategory
      return matchSearch && matchCategory
    })
    .sort((a, b) => { if (a.stock_qty > 0 && b.stock_qty <= 0) return -1; if (a.stock_qty <= 0 && b.stock_qty > 0) return 1; return 0 })

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))

async function handleHoldOrder() {
  const name = holdName.trim() || customerSearch.trim()
  if (!name || cart.length === 0) return
  await supabase.from('held_orders').insert({
    customer_name: name,
    customer_id: customerId || null,
    zone_id: zoneId || null,
    delivery_address: deliveryAddress || null,
    items: cart,
    total
  })
  setCart([])
  setDiscount(0)
  setHoldName('')
  setShowHoldDialog(false)
  setShowCart(false)
  fetchData()
  alert('พักบิลเรียบร้อยแล้วค่ะ!')
}

  async function loadHeldOrder(order: HeldOrder) {
    setCart(order.items)
    setCustomerSearch(order.customer_name)
    setCustomerId(order.customer_id || '')
    setZoneId(order.zone_id || '')
    setDeliveryAddress(order.delivery_address || '')
    await supabase.from('held_orders').delete().eq('id', order.id)
    setShowHeldOrders(false)
    fetchData()
  }

  async function loadFromOrderHistory(order: any) {
    setCart([])
    setEditingOrderId(order.id)
    setCustomerSearch(order.customers?.name || '')
    setCustomerId(order.customer_id || '')
    setShowOrderHistory(false)
    setShowCart(false)
    alert(`เลือกบิลของ ${order.customers?.name || 'ลูกค้าทั่วไป'} แล้วค่ะ\nเพิ่มสินค้าที่ต้องการได้เลยค่ะ`)
  }

  async function handleUpdateOrder() {
    if (!editingOrderId || cart.length === 0) return
    setSaving(true)
    try {
      const { data: order } = await supabase.from('orders').select('subtotal, discount, total, order_type').eq('id', editingOrderId).single()
      if (!order) return
      await supabase.from('order_items').insert(cart.map(item => ({
        order_id: editingOrderId, product_id: item.product_id,
        quantity: item.quantity, unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
      })))
      const addedTotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)
      await supabase.from('orders').update({ subtotal: order.subtotal + addedTotal, total: order.total + addedTotal }).eq('id', editingOrderId)
      if (order.order_type !== 'reservation') {
        for (const item of cart) {
          const { data: product } = await supabase.from('products').select('stock_qty').eq('id', item.product_id).single()
          if (product) {
            await supabase.from('products').update({ stock_qty: product.stock_qty - item.quantity }).eq('id', item.product_id)
            await supabase.from('stock_movements').insert({ product_id: item.product_id, type: 'OUT', quantity: item.quantity, ref_type: 'order', ref_id: editingOrderId })
          }
        }
      }
      setCart([]); setEditingOrderId(null); setCustomerSearch(''); setCustomerId(''); setShowCart(false)
      alert('อัปเดตบิลเรียบร้อยค่ะ! ✅'); fetchData()
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  async function handleCancelOrder(order: any) {
    if (!confirm(`ยืนยันยกเลิกบิลของ ${order.customers?.name || 'ลูกค้าทั่วไป'}?`)) return
    setSaving(true)
    try {
      await supabase.from('deliveries').delete().eq('order_id', order.id)
      if (order.order_type !== 'reservation') {
        for (const item of order.order_items || []) {
          const { data: product } = await supabase.from('products').select('stock_qty').eq('id', item.product_id).single()
          if (product) {
            await supabase.from('products').update({ stock_qty: product.stock_qty + item.quantity }).eq('id', item.product_id)
            await supabase.from('stock_movements').insert({ product_id: item.product_id, type: 'IN', quantity: item.quantity, ref_type: 'cancel', ref_id: order.id })
          }
        }
      }
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
      setSelectedOrder(null); fetchOrderHistory(); alert('ยกเลิกบิลเรียบร้อยค่ะ')
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  async function deleteHeldOrder(id: string) {
    if (!confirm('ลบบิลที่พักไว้?')) return
    await supabase.from('held_orders').delete().eq('id', id); fetchData()
  }

  async function handleAddNewCustomer() {
    if (!newCustomerName.trim()) return
    setAddingCustomer(true)
    try {
      const { data: newCustomer } = await supabase.from('customers').insert({
        name: newCustomerName.trim(), phone: newCustomerPhone || null, zone_id: zoneId || null, address: deliveryAddress || null,
      }).select().single()
      if (newCustomer) { setCustomerId(newCustomer.id); setCustomerSearch(newCustomer.name); setShowAddCustomer(false); setNewCustomerName(''); setNewCustomerPhone(''); fetchData() }
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
    setAddingCustomer(false)
  }

  function generateSlip(orderCart: typeof cart, orderTotal: number, orderDiscount: number, orderSubtotal: number, isReservation: boolean) {
    const line = '──────────'
    const date = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    const customerName = customerSearch || 'ลูกค้าทั่วไป'
    let text = `🐱 ร้าน Pick a cat.\nวันที่ ${date}\nลูกค้า: ${customerName}\n${line}\n`
    orderCart.forEach(item => { text += `${item.quantity}  ${item.name}\n${''.padStart(15)}${(item.unit_price * item.quantity).toLocaleString()}฿\n` })
    text += `${line}\n`
    if (orderDiscount > 0) { text += `ราคารวม         ${orderSubtotal.toLocaleString()}฿\nส่วนลด          -${orderDiscount.toLocaleString()}฿\n` }
    text += `ยอดสุทธิ        ${orderTotal.toLocaleString()}฿\n${line}\n`
    if (isReservation) { text += `🏪 ฝากของ (รอแจ้งวันส่ง)\n` }
    else { text += `📅 ส่งวันที่ ${new Date(scheduledDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}\n` }
    if (deliveryAddress) text += `📍 ${deliveryAddress}\n`
    return text
  }

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
          scheduled_date: scheduledDate, bag_count: bagCount,
          status: 'pending', note: deliveryAddress || null
        })
        for (const item of cart) {
          const { data: p } = await supabase.from('products').select('stock_qty').eq('id', item.product_id).single()
          if (p) {
            await supabase.from('products').update({ stock_qty: p.stock_qty - item.quantity }).eq('id', item.product_id)
            await supabase.from('stock_movements').insert({ product_id: item.product_id, type: 'OUT', quantity: item.quantity, ref_type: 'order', ref_id: order.id })
          }
        }
      }
      const slip = generateSlip(cart, total, discount, subtotal, orderType === 'reservation')
      setSlipText(slip); setShowSlip(true)
      setCart([]); setDiscount(0); setCustomerId(''); setCustomerSearch('')
      setNote(''); setBagCount(0); setZoneId(''); setDeliveryAddress('')
      setOrderType('normal')
      if (deliveryRounds.length > 0) setScheduledDate(deliveryRounds[0].delivery_date)
      setShowCheckout(false); setShowCart(false)
      fetchData()
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ: ' + (e as any)?.message) }
    setSaving(false)
  }

  async function fetchOrderHistory() {
    const { data } = await supabase
      .from('orders').select('*, order_items(id, quantity, unit_price, product_id, products(id, name, unit)), customers(name)')
      .not('status', 'eq', 'cancelled').order('created_at', { ascending: false }).limit(50)
    setOrderHistory(data || [])
  }

  async function saveEditOrder() {
    if (!selectedOrder) return
    setSaving(true)
    try {
      const items = selectedOrder.order_items || []
      const newSubtotal = items.reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0)
      const newTotal = Math.max(0, newSubtotal - editOrderDiscount)
      await supabase.from('orders').update({ discount: editOrderDiscount, total: newTotal, payment_status: editOrderStatus, paid_at: editOrderStatus === 'paid' ? new Date().toISOString() : null }).eq('id', selectedOrder.id)
      setEditingOrder(false)
      const { data: updated } = await supabase.from('orders').select('*, order_items(id, quantity, unit_price, product_id, products(id, name, unit)), customers(name)').eq('id', selectedOrder.id).single()
      if (updated) setSelectedOrder(updated)
      fetchOrderHistory(); alert('แก้ไขบิลเรียบร้อยค่ะ ✅')
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  async function removeOrderItem(orderId: string, itemId: string, _productId: string, _qty: number) {
    if (!confirm('ลบรายการนี้ออกจากบิล?')) return
    try {
      await supabase.from('order_items').delete().eq('id', itemId)
      const { data: updated } = await supabase.from('orders').select('*, order_items(id, quantity, unit_price, product_id, products(id, name, unit)), customers(name)').eq('id', orderId).single()
      if (updated) {
        const newSubtotal = (updated.order_items || []).reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0)
        const newTotal = Math.max(0, newSubtotal - (updated.discount || 0))
        await supabase.from('orders').update({ subtotal: newSubtotal, total: newTotal }).eq('id', orderId)
        const { data: final } = await supabase.from('orders').select('*, order_items(id, quantity, unit_price, product_id, products(id, name, unit)), customers(name)').eq('id', orderId).single()
        if (final) setSelectedOrder(final)
      }
      fetchOrderHistory()
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
  }

  const filteredHistory = orderHistory.filter(o => {
    const matchSearch = !historySearch || o.customers?.name?.toLowerCase().includes(historySearch.toLowerCase())
    const matchDate = !historyDate || o.created_at?.startsWith(historyDate)
    return matchSearch && matchDate
  })

  return (
    <main className="min-h-screen bg-[#fff5f3]">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3 space-y-2.5">

        {/* Row 1: พักบิล + ล้างตะกร้า (ซ้าย) | Pre-order (ขวา) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHeldOrders(true)}
              className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 shadow-sm text-xs font-semibold text-amber-500 active:scale-95 transition-transform"
            >
              📌 พักบิล
              {heldOrders.length > 0 && (
                <span className="bg-amber-400 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {heldOrders.length}
                </span>
              )}
            </button>
            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 shadow-sm text-xs font-semibold text-rose-400 disabled:opacity-40 active:scale-95 transition-transform"
            >
              🗑️ ล้างตะกร้า
            </button>
          </div>
          <button
            onClick={() => setPreorderMode(!preorderMode)}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all active:scale-95 shadow-sm ${preorderMode ? 'bg-purple-500 text-white' : 'bg-white text-gray-400'}`}
          >
            🔮 Pre-order
            <div className={`relative w-8 h-4 rounded-full transition-colors ${preorderMode ? 'bg-white/30' : 'bg-gray-200'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${preorderMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </div>

        {/* Row 2: ← | ค้นหา | 📷 | 📋 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/')}
            className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform flex-shrink-0"
          >
            ←
          </button>
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-white rounded-2xl pl-8 pr-3 py-2.5 text-sm shadow-sm outline-none placeholder-gray-300"
              placeholder="ค้นหาสินค้า หรือ รหัส..."
            />
          </div>
          <button onClick={startScanner} className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-base active:scale-95 transition-transform flex-shrink-0">
            📷
          </button>
          <button
            onClick={() => { setShowOrderHistory(true); fetchOrderHistory() }}
            className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-base active:scale-95 transition-transform flex-shrink-0"
          >
            📋
          </button>
        </div>

        {/* Row 3: Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          <button onClick={() => setSelectedCategory('')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${!selectedCategory ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
            ทั้งหมด
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelectedCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${selectedCategory === c.id ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* ══ EDITING BANNER ══ */}
      {editingOrderId && (
        <div className="mx-4 mt-3 bg-gradient-to-r from-purple-400 to-fuchsia-400 rounded-2xl p-3 flex items-center justify-between">
          <div>
            <div className="text-white text-sm font-bold">✏️ เพิ่มของให้บิล: {customerSearch || 'ลูกค้าทั่วไป'}</div>
            <div className="text-white/80 text-xs">เลือกสินค้าที่ต้องการเพิ่ม แล้วกด "อัปเดตบิล"</div>
          </div>
          <button onClick={() => { setEditingOrderId(null); setCart([]); setCustomerSearch(''); setCustomerId('') }}
            className="text-white/80 text-lg w-8 h-8 flex items-center justify-center">✕</button>
        </div>
      )}

      {/* ══ PRODUCT GRID ══ */}
      <div className="px-4 pt-3 pb-32">
        {filteredProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">🐱</div>
            <p>ยังไม่มีสินค้าค่ะ</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {filteredProducts.filter(p => preorderMode || p.stock_qty > 0).map(product => {
              const inCart = cart.find(c => c.product_id === product.id)
              const promo = getPromotion(product.id)
              return (
                <button key={product.id} onClick={() => addToCart(product)}
                  disabled={product.stock_qty === 0 && !preorderMode}
                  className={`bg-white rounded-2xl shadow-sm relative overflow-hidden text-left active:scale-95 transition-transform ${product.stock_qty === 0 && !preorderMode ? 'opacity-50' : ''} ${product.stock_qty === 0 && preorderMode ? 'ring-2 ring-purple-300' : ''}`}>
                  {inCart && (
                    <div className="absolute top-1 right-1 bg-gradient-to-br from-orange-400 to-rose-400 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center z-10">
                      {inCart.quantity}
                    </div>
                  )}
                  <div className="p-2">
                    <div className="w-full aspect-square bg-rose-50 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
                      {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" /> : <span className="text-2xl">🐱</span>}
                    </div>
                    <div className="font-medium text-xs text-gray-800 mb-1 line-clamp-2 min-h-[2rem]">{product.name}</div>
                    <div className="text-rose-500 font-bold text-sm">
                      {promo ? promo.unit_price : product.selling_price}฿
                      {promo && <span className="text-xs text-purple-500 ml-1">🎁</span>}
                    </div>
                    <div className={`text-xs flex items-center gap-1 ${product.stock_qty === 0 ? (preorderMode ? 'text-purple-500 font-bold' : 'text-red-500 font-bold') : 'text-gray-400'}`}>
                      <span>{product.stock_qty === 0 ? (preorderMode ? '🔮 พรีออเดอร์' : 'หมด') : `เหลือ ${product.stock_qty}`}</span>
                      {heldQtyMap[product.id] > 0 && <span className="text-amber-500">🔒 {heldQtyMap[product.id]}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

{/* ══ FLOATING CART ══ */}
{cartCount > 0 && (
  <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-2 bg-gradient-to-t from-[#fff5f3] to-transparent">
    <div className="flex items-center bg-white rounded-full shadow-xl overflow-hidden">
      <button
        onClick={() => setShowHoldDialog(true)}
        className="flex items-center gap-1.5 px-4 py-4 text-amber-500 font-semibold text-sm active:scale-95 transition-transform"
      >
        📌 พักบิล
      </button>
      <div className="w-px h-6 bg-gray-200" />
      <button
        onClick={copyCart}
        className="flex items-center gap-1.5 px-4 py-4 text-gray-500 font-semibold text-sm active:scale-95 transition-transform"
      >
        📋 คัดลอก
      </button>
      <div className="w-px h-6 bg-gray-200" />
      <button
        onClick={() => setShowCart(true)}
        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold px-5 py-4 text-sm active:scale-95 transition-transform"
      >
        🛒 ({cartCount})
        <span className="bg-white/25 rounded-full px-2.5 py-0.5 text-xs font-extrabold">
          {total.toLocaleString()}฿
        </span>
      </button>
    </div>
  </div>
)}

      {/* ══ FLOATING MEMBER BUTTON ══ */}
<button
  onClick={() => setShowMemberSearch(true)}
  className="fixed bottom-24 right-4 z-30 w-12 h-12 bg-gradient-to-br from-purple-400 to-fuchsia-500 text-white rounded-full shadow-xl flex items-center justify-center text-xl active:scale-95 transition-transform"
>
  👤
</button>

{/* ══ MEMBER SEARCH POPUP ══ */}
{showMemberSearch && (
  <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setShowMemberSearch(false)}>
    <div className="bg-[#fff5f3] w-full rounded-t-3xl max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2 mb-3">
        <h3 className="font-bold text-gray-800 text-lg">👤 สมาชิก</h3>
        <button
          onClick={() => { setShowMemberSearch(false); setShowAddCustomer(true) }}
          className="w-9 h-9 bg-gradient-to-br from-purple-400 to-fuchsia-500 text-white rounded-full flex items-center justify-center text-lg shadow-sm active:scale-95 transition-transform"
        >
          ➕
        </button>
      </div>

      {/* ค้นหา */}
      <div className="px-4 mb-3">
        <input
          value={customerSearch}
          onChange={e => { setCustomerSearch(e.target.value); setCustomerId('') }}
          className="w-full bg-white rounded-2xl px-4 py-3 text-sm shadow-sm outline-none placeholder-gray-300"
          placeholder="🔍 ค้นหาชื่อสมาชิก..."
          autoFocus
        />
      </div>

      {/* รายชื่อ */}
      <div className="px-4 space-y-2 pb-8">
        {customers
          .filter(c => !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
          .slice(0, 10)
          .map(c => (
            <button
              key={c.id}
              onClick={() => {
                setCustomerId(c.id)
                setCustomerSearch(c.name)
                if (c.zone_id) setZoneId(c.zone_id)
                if (c.address) setDeliveryAddress(c.address)
                setShowMemberSearch(false)
              }}
              className={`w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm active:scale-[0.98] transition-transform ${customerId === c.id ? 'ring-2 ring-rose-300' : ''}`}
            >
              <div className="w-9 h-9 bg-rose-50 rounded-full flex items-center justify-center text-base flex-shrink-0">
                🐱
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                {c.address && (
                  <p className="text-xs text-gray-400 truncate">📍 {c.address}</p>
                )}
                {c.zone_id && zones.find(z => z.id === c.zone_id) && (
                  <p className="text-xs text-gray-300">
                    🗺️ {zones.find(z => z.id === c.zone_id)?.name}
                  </p>
                )}
              </div>
              {customerId === c.id && (
                <span className="text-rose-400 font-bold text-sm flex-shrink-0">✓</span>
              )}
            </button>
          ))}
        {customers.filter(c =>
          !customerSearch ||
          c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.phone?.includes(customerSearch)
        ).length === 0 && (
          <p className="text-center text-gray-400 text-sm py-6">ไม่พบสมาชิกค่ะ</p>
        )}
      </div>
    </div>
  </div>
)}

      {/* ══ SCANNER ══ */}
      {showScanner && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex justify-between items-center p-4 pt-10">
            <h3 className="font-bold text-white text-lg">📷 สแกนบาร์โค้ด</h3>
            <button onClick={stopScanner} className="text-white text-2xl">✕</button>
          </div>
          <div id="qr-reader" className="w-full flex-1" />
          <div className="p-4 text-center text-white text-sm opacity-70">ส่องกล้องไปที่บาร์โค้ดสินค้าค่ะ</div>
        </div>
      )}
{/* ══ CART MODAL */}

{showCart && (
  <div className="fixed inset-0 bg-black/50 z-40 flex items-end">
    <div className="bg-[#fff5f3] w-full rounded-t-3xl max-h-[85vh] overflow-y-auto">
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>
      <div className="flex justify-between items-center px-4 py-2">
        <h3 className="font-bold text-lg text-gray-800">
          {editingOrderId ? `✏️ เพิ่มของให้ ${customerSearch || 'ลูกค้า'}` : '🛒 รายละเอียดสินค้า'}
        </h3>
        <button onClick={() => setShowCart(false)} className="text-gray-400 text-xl">✕</button>
      </div>

      {/* รายการสินค้า */}
      <div className="px-4 space-y-2 mb-3">
        {cart.map((item, index) => (
          <div key={index} className="bg-white rounded-2xl p-3 flex gap-3 shadow-sm">
            <div className="w-14 h-14 bg-rose-50 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
              {item.image_url ? <img src={item.image_url} className="w-full h-full object-contain p-1" /> : <span className="text-2xl">🐱</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <p className="text-sm font-semibold text-gray-800 line-clamp-1 flex-1 mr-2">{item.name}</p>
                <button onClick={() => removeFromCart(index)} className="text-gray-300 text-lg">✕</button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => updateQty(index, item.quantity - 1)}
                  className="w-7 h-7 bg-rose-50 rounded-lg text-rose-500 font-bold flex items-center justify-center">−</button>
                <input type="number" value={item.quantity} onChange={e => updateQty(index, Number(e.target.value))}
                  className="w-10 text-center bg-gray-50 rounded-lg py-1 text-sm font-semibold outline-none" />
                <button onClick={() => updateQty(index, item.quantity + 1)}
                  className="w-7 h-7 bg-rose-50 rounded-lg text-rose-500 font-bold flex items-center justify-center">+</button>
                <span className="text-gray-300">×</span>
                <input type="number" value={item.unit_price} onChange={e => updatePrice(index, Number(e.target.value))}
                  className="w-16 text-center bg-gray-50 rounded-lg py-1 text-sm font-semibold outline-none" />
                <span className="text-gray-400 text-xs">฿</span>
                <span className="ml-auto text-sm font-bold text-rose-500">{(item.unit_price * item.quantity).toLocaleString()}฿</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ยอดรวม */}
      <div className="mx-4 bg-white rounded-2xl px-4 py-3 shadow-sm mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-sm text-gray-500">ส่วนลด</span>
          <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))}
            className="w-24 text-right bg-gray-50 rounded-xl px-3 py-1 text-sm font-bold outline-none" />
        </div>
        {promoDiscount > 0 && (
          <div className="flex justify-between text-sm text-purple-500 mb-1.5">
            <span>🎁 โปรโมชั่น</span><span>-{promoDiscount.toLocaleString()}฿</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="font-bold text-gray-800">รวมทั้งสิ้น</span>
          <span className="text-xl font-extrabold text-rose-500">{total.toLocaleString()}฿</span>
        </div>
      </div>

      {/* ปุ่ม */}
      <div className="px-4 pb-6 space-y-2">
        {editingOrderId ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setEditingOrderId(null); setCart([]); setCustomerSearch(''); setCustomerId(''); setShowCart(false) }}
              className="bg-white text-gray-500 font-bold py-3.5 rounded-2xl shadow-sm">ยกเลิก</button>
            <button onClick={handleUpdateOrder} disabled={saving}
              className="bg-gradient-to-r from-purple-400 to-fuchsia-500 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : '✏️ อัปเดตบิล'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowCart(false); setShowCheckout(true) }}
            className="w-full bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold py-3.5 rounded-2xl shadow-sm"
          >
            ชำระเงิน →
          </button>
        )}
      </div>
    </div>
  </div>
)}

      {/* ══ HOLD DIALOG ══ */}
      {showHoldDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-xl">

          <h3 className="font-bold text-gray-800 mb-1">📌 พักบิล</h3>
      <p className="text-xs text-gray-400 mb-3">พักตะกร้า {cartCount} รายการ · {total.toLocaleString()}฿</p>

      {customerSearch ? (
        <div className="bg-rose-50 rounded-2xl px-4 py-3 mb-3 flex items-center gap-2">
          <span className="text-base">👤</span>
          <span className="text-sm font-semibold text-gray-800">{customerSearch}</span>
        </div>
      ) : (
        <input value={holdName} onChange={e => setHoldName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleHoldOrder()}
          autoFocus className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none mb-3 placeholder-gray-300"
          placeholder="ชื่อลูกค้า / ชื่อบิล" />
      )}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowHoldDialog(false)} className="bg-gray-100 text-gray-500 font-semibold py-3 rounded-2xl text-sm">ยกเลิก</button>
              <button onClick={handleHoldOrder} disabled={!holdName.trim() && !customerSearch.trim()}
                className="bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-50">พักบิล</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ HELD ORDERS ══ */}
      {showHeldOrders && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-end" onClick={() => setShowHeldOrders(false)}>
          <div className="bg-[#fff5f3] w-full rounded-t-3xl max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center px-4 py-2 mb-2">
              <h3 className="font-bold text-gray-800 text-lg">📌 บิลที่พักไว้</h3>
              <button onClick={() => setShowHeldOrders(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="px-4 pb-8 space-y-2">
              {heldOrders.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">ไม่มีบิลที่พักไว้ค่ะ</p>
              ) : heldOrders.map(o => (
                <div key={o.id} className="bg-white rounded-2xl p-3.5 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-sm text-gray-800">{o.customer_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{o.items.length} รายการ · {o.total.toLocaleString()}฿</p>
                      <p className="text-xs text-gray-300">{new Date(o.created_at).toLocaleString('th-TH')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => loadHeldOrder(o)}
                        className="bg-gradient-to-r from-orange-400 to-rose-400 text-white text-xs px-3 py-2 rounded-xl font-semibold">ดึงกลับ</button>
                      <button onClick={() => deleteHeldOrder(o.id)}
                        className="bg-red-50 text-red-400 text-xs px-3 py-2 rounded-xl font-semibold">ลบ</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ CHECKOUT ══ */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">สรุปยอด</h3>
              <button onClick={() => setShowCheckout(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-gray-500">ลูกค้า</label>
                    <button onClick={() => setShowAddCustomer(true)} className="text-xs text-rose-400 font-bold">+ เพิ่มลูกค้าใหม่</button>
                  </div>
                  <input value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setCustomerId('') }}
                    className="w-full border border-gray-200 rounded-xl p-2 text-sm bg-white" placeholder="ค้นหาลูกค้า" />
                  {customerSearch && !customerId && filteredCustomers.length > 0 && (
                    <div className="border border-gray-200 rounded-xl mt-1 max-h-36 overflow-y-auto bg-white">
                      {filteredCustomers.slice(0, 5).map(c => (
                        <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); if (c.zone_id) setZoneId(c.zone_id); if (c.address) setDeliveryAddress(c.address) }}
                          className="w-full text-left p-2 border-b border-gray-100 hover:bg-gray-50 text-sm">
                          <div className="font-medium">{c.name}</div>
                          {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">สถานที่ส่ง</label>
                    <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm bg-white" placeholder="หอพัก/ห้อง" /></div>
                  <div><label className="text-xs text-gray-500">โซน</label>
                    <select value={zoneId} onChange={e => setZoneId(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm bg-white">
                      <option value="">ไม่ระบุ</option>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select></div>
                </div>
              </div>
              <div className="bg-rose-50 rounded-2xl p-3">
                <label className="text-xs text-rose-600 font-bold mb-2 block">ประเภทการสั่ง</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setOrderType('normal')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all ${orderType === 'normal' ? 'bg-gradient-to-r from-orange-400 to-rose-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                    🛒 ขายปกติ
                  </button>
                  <button onClick={() => setOrderType('reservation')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all ${orderType === 'reservation' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                    🏪 ฝากของ
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {orderType === 'normal' ? '📅 กำหนดวันส่งตามรอบลงของ · ตัด stock ทันที' : '📅 รอลูกค้าแจ้งวันส่ง · ตัด stock ทันที'}
                </p>
              </div>
              {orderType === 'normal' && (
                <div className="bg-green-50 rounded-2xl p-3">
                  <label className="text-xs text-green-700 font-bold mb-2 block">📅 วันที่ส่ง</label>
                  {deliveryRounds.length > 0 ? (
                    <div className="space-y-2">
                      <select value={scheduledDate} onChange={e => { setScheduledDate(e.target.value); if (e.target.value !== 'custom') setCustomScheduledDate('') }}
                        className="w-full border border-green-200 rounded-xl p-2 text-sm bg-white">
                        <option value="">-- เลือกรอบลงของ --</option>
                        {deliveryRounds.map(round => (
                          <option key={round.id} value={round.delivery_date}>
                            🛵 {new Date(round.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                            {round.note ? ` — ${round.note}` : ''}
                          </option>
                        ))}
                        <option value="custom">📅 วันอื่น (กำหนดเอง)</option>
                      </select>
                      {scheduledDate === 'custom' && (
                        <input type="date" value={customScheduledDate} onChange={e => setCustomScheduledDate(e.target.value)}
                          className="w-full border border-green-200 rounded-xl p-2 text-sm bg-white" />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                        className="w-full border border-green-200 rounded-xl p-2 text-sm bg-white" />
                      <p className="text-xs text-amber-500">⚠️ ยังไม่มีรอบลงของ กรุณาบันทึกในหน้าการเงินก่อนค่ะ</p>
                    </div>
                  )}
                </div>
              )}
              <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
                <div>
                  <label className="text-xs text-gray-500">สถานะชำระเงิน</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button onClick={() => setPaymentStatus('paid')} className={`py-2 rounded-xl text-sm font-medium ${paymentStatus === 'paid' ? 'bg-teal-500 text-white' : 'bg-white text-gray-600'}`}>✅ จ่ายแล้ว</button>
                    <button onClick={() => setPaymentStatus('pending')} className={`py-2 rounded-xl text-sm font-medium ${paymentStatus === 'pending' ? 'bg-amber-400 text-white' : 'bg-white text-gray-600'}`}>⏳ ค้างชำระ</button>
                  </div>
                </div>
                {paymentStatus === 'paid' && (
                  <div>
                    <label className="text-xs text-gray-500">วิธีชำระ</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <button onClick={() => setPaymentMethod('cash')} className={`py-2 rounded-xl text-sm font-medium ${paymentMethod === 'cash' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-white text-gray-600'}`}>💵 เงินสด</button>
                      <button onClick={() => setPaymentMethod('transfer')} className={`py-2 rounded-xl text-sm font-medium ${paymentMethod === 'transfer' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-white text-gray-600'}`}>💳 โอน</button>
                    </div>
                  </div>
                )}
                <div><label className="text-xs text-gray-500">หมายเหตุ</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm bg-white" rows={2} placeholder="หมายเหตุเพิ่มเติม" /></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex justify-between text-sm"><span className="text-gray-500">รายการ</span><span>{cart.length} รายการ</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">ราคารวม</span><span>{subtotal.toLocaleString()}฿</span></div>
                {discount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">ส่วนลด</span><span className="text-teal-500">-{discount.toLocaleString()}฿</span></div>}
                {promoDiscount > 0 && <div className="flex justify-between text-sm text-purple-600"><span>🎁 โปรโมชั่น</span><span>-{promoDiscount.toLocaleString()}฿</span></div>}
                <div className="flex justify-between font-bold text-lg mt-1 pt-2 border-t border-gray-100">
                  <span>รวมทั้งสิ้น</span><span className="text-rose-500">{total.toLocaleString()}฿</span>
                </div>
              </div>
            </div>
            <button onClick={handleCheckout} disabled={saving || (orderType === 'normal' && !scheduledDate && scheduledDate !== 'custom') || (scheduledDate === 'custom' && !customScheduledDate)}
              className={`w-full font-bold py-3 rounded-2xl mt-4 disabled:opacity-50 ${orderType === 'reservation' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500 text-white' : 'bg-gradient-to-r from-orange-400 to-rose-500 text-white'}`}>
              {saving ? 'กำลังบันทึก...' : orderType === 'reservation' ? '🏪 ยืนยันฝากของ' : '✅ ยืนยันการขาย'}
            </button>
          </div>
        </div>
      )}

      {/* ══ SLIP ══ */}
      {showSlip && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-lg">🧾 สลิปสินค้า</h3>
              <button onClick={() => { setShowSlip(false); setCopied(false) }} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mb-3 font-mono text-xs whitespace-pre-wrap text-gray-800 max-h-64 overflow-y-auto">{slipText}</div>
            <button onClick={() => { navigator.clipboard.writeText(slipText); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className={`w-full font-bold py-3 rounded-2xl transition-colors ${copied ? 'bg-teal-500 text-white' : 'bg-gradient-to-r from-orange-400 to-rose-500 text-white'}`}>
              {copied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกข้อความ'}
            </button>
            <button onClick={() => { setShowSlip(false); setCopied(false) }} className="w-full bg-gray-100 text-gray-600 font-bold py-3 rounded-2xl mt-2">ปิด</button>
          </div>
        </div>
      )}

      {/* ══ ADD CUSTOMER ══ */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-gray-800 mb-3">👤 เพิ่มลูกค้าใหม่</h3>
            <div className="space-y-2">
              <input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} autoFocus className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none" placeholder="ชื่อลูกค้า *" />
              <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none" placeholder="ที่อยู่/ห้อง" />
              <select value={zoneId} onChange={e => setZoneId(e.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none">
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

<OrderHistoryPopup
  show={showOrderHistory}
  onClose={() => setShowOrderHistory(false)}
  onSelectOrder={(o) => {
    setSelectedOrder(o)
    setEditOrderDiscount(o.discount || 0)
    setEditOrderStatus(o.payment_status || 'pending')
    setEditingOrder(false)
    setShowOrderHistory(false)
  }}
/>

{/* ══ ORDER DETAIL ══ */}
<OrderDetailPopup
  order={selectedOrder}
  onClose={() => setSelectedOrder(null)}
  onCancelled={() => { setSelectedOrder(null); setShowOrderHistory(true) }}
  onUpdated={() => { setSelectedOrder(null); setShowOrderHistory(true) }}
/>
      

    </main>
  )
}