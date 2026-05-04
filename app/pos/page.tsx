'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

type Product = {
  id: string
  name: string
  code: string
  unit: string
  selling_price: number
  stock_qty: number
  image_url: string | null
  category_id: string
  categories: { name: string } | null
}

type Category = { id: string; name: string }

type CartItem = {
  product_id: string
  name: string
  unit: string
  quantity: number
  unit_price: number
  original_price: number
  image_url: string | null
}

type Customer = {
  id: string
  name: string
  phone: string
  zone_id: string
  address: string
  location_type: string
}

type HeldOrder = {
  id: string
  customer_name: string
  items: CartItem[]
  total: number
  created_at: string
}

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
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([])
  const [holdName, setHoldName] = useState('')
  const [showHoldDialog, setShowHoldDialog] = useState(false)
  const [preorderMode, setPreorderMode] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const scannerRef = useRef<any>(null)


  // Checkout state
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
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0])
  const [bagCount, setBagCount] = useState(0)
  const [zones, setZones] = useState<{ id: string; name: string }[]>([])
  const [zoneId, setZoneId] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
  const [{ data: p }, { data: cat }, { data: c }, { data: h }, { data: z }] = await Promise.all([
  supabase.from('products').select('*, categories(name)').eq('is_active', true).order('name'),
  supabase.from('categories').select('*').order('name'),
  supabase.from('customers').select('*').order('name'),
  supabase.from('held_orders').select('*').order('created_at', { ascending: false }),
  supabase.from('zones').select('*').order('name'),
])

    setProducts(p || [])
    setCategories(cat || [])
    setCustomers(c || [])
    setHeldOrders(h || [])
    setZones(z || [])
  }

async function startScanner() {
  setShowScanner(true)
  setTimeout(async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {

const found = products.find(p =>
  p.code === decodedText
)

          if (found) {
            addToCart(found)
            stopScanner()
          } else {
            setSearch(decodedText)
            stopScanner()
          }
        },
        () => {}
      )
    } catch (e) {
      console.error('Scanner error:', e)
      stopScanner()
    }
  }, 100)
}

async function stopScanner() {
  try {
    if (scannerRef.current) {
      await scannerRef.current.stop()
      scannerRef.current = null
    }
  } catch (e) {}
  setShowScanner(false)
}

  function addToCart(product: Product) {
    const existing = cart.find(i => i.product_id === product.id)
    if (existing) {
      setCart(cart.map(i =>
        i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
      ))
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        unit: product.unit,
        quantity: 1,
        unit_price: product.selling_price,
        original_price: product.selling_price,
        image_url: product.image_url,
      }])
    }
  }

  function updateQty(index: number, qty: number) {
    if (qty <= 0) {
      removeFromCart(index)
      return
    }
    setCart(cart.map((item, i) => i === index ? { ...item, quantity: qty } : item))
  }

  function updatePrice(index: number, price: number) {
    setCart(cart.map((item, i) => i === index ? { ...item, unit_price: price } : item))
  }

  function removeFromCart(index: number) {
    setCart(cart.filter((_, i) => i !== index))
  }

  const subtotal = cart.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)
  const total = Math.max(0, subtotal - discount)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)



const filteredProducts = products
  .filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !selectedCategory || p.category_id === selectedCategory
    return matchSearch && matchCategory
  })
  .sort((a, b) => {
    if (a.stock_qty > 0 && b.stock_qty <= 0) return -1
    if (a.stock_qty <= 0 && b.stock_qty > 0) return 1
    return 0
  })

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  )

  async function handleHoldOrder() {
    if (!holdName.trim() || cart.length === 0) return
    await supabase.from('held_orders').insert({
      customer_name: holdName.trim(),
      items: cart,
      total,
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
    await supabase.from('held_orders').delete().eq('id', order.id)
    setShowHeldOrders(false)
    fetchData()
  }

  async function deleteHeldOrder(id: string) {
    if (!confirm('ลบบิลที่พักไว้?')) return
    await supabase.from('held_orders').delete().eq('id', id)
    fetchData()
  }

  async function handleAddNewCustomer() {
  if (!newCustomerName.trim()) return
  setAddingCustomer(true)
  try {
    const { data: newCustomer } = await supabase
      .from('customers')
      .insert({
        name: newCustomerName.trim(),
        phone: newCustomerPhone || null,
        zone_id: zoneId || null,
        address: deliveryAddress || null,
      })
      .select()
      .single()

    if (newCustomer) {
      setCustomerId(newCustomer.id)
      setCustomerSearch(newCustomer.name)
      setShowAddCustomer(false)
      setNewCustomerName('')
      setNewCustomerPhone('')
      fetchData()
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดค่ะ')
  }
  setAddingCustomer(false)
}

function generateSlip(orderCart: typeof cart, orderTotal: number, orderDiscount: number, orderSubtotal: number) {
  const line = '──────────'
  const date = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  const customerName = customerSearch || 'ลูกค้าทั่วไป'
  const sendDate = new Date(scheduledDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

  let text = `🐱 ร้าน Pick a cat.\n`
  text += `วันที่ ${date}\n`
  text += `ลูกค้า: ${customerName}\n`
  text += `${line}\n`

orderCart.forEach(item => {
  const price = `${(item.unit_price * item.quantity).toLocaleString()}฿`
  text += `${item.quantity}  ${item.name}\n`
  text += `${''.padStart(15)}${price}\n`
})

  text += `${line}\n`

  if (orderDiscount > 0) {
    text += `ราคารวม         ${orderSubtotal.toLocaleString()}฿\n`
    text += `ส่วนลด          -${orderDiscount.toLocaleString()}฿\n`
  }

  text += `ยอดสุทธิ        ${orderTotal.toLocaleString()}฿\n`
  text += `${line}\n`
  text += `📅 ส่งวันที่ ${sendDate}\n`

  if (deliveryAddress) {
    text += `📍 ${deliveryAddress}\n`
  }

  return text
}

  async function handleCheckout() {
    if (cart.length === 0) return
    setSaving(true)
    try {
      const { data: order, error } = await supabase.from('orders').insert({
        customer_id: customerId || null,
        subtotal,
        discount,
        total,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
        note,
      }).select().single()

      if (error) throw error

      await supabase.from('order_items').insert(
        cart.map(item => ({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.quantity,
        }))
      )

      // สร้าง delivery
await supabase.from('deliveries').insert({
  order_id: order.id,
  zone_id: zoneId || null,
  scheduled_date: scheduledDate,
  bag_count: bagCount,
  status: 'pending',
  note: deliveryAddress || null,
})

      for (const item of cart) {
        const { data: p } = await supabase.from('products')
          .select('stock_qty').eq('id', item.product_id).single()
        if (p) {
          await supabase.from('products').update({
            stock_qty: p.stock_qty - item.quantity
          }).eq('id', item.product_id)

          await supabase.from('stock_movements').insert({
            product_id: item.product_id,
            type: 'OUT',
            quantity: item.quantity,
            ref_type: 'order',
            ref_id: order.id,
          })
        }
      }

// generate slip ก่อน clear cart
const slip = generateSlip(cart, total, discount, subtotal)
setSlipText(slip)
setShowSlip(true)

      setCart([])
      setDiscount(0)
      setCustomerId('')
      setCustomerSearch('')
setNote('')
setScheduledDate(new Date().toISOString().split('T')[0])
setBagCount(0)
setZoneId('')
setDeliveryAddress('')
      setShowCheckout(false)
      setShowCart(false)
      fetchData()
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setSaving(false)
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-3xl mx-auto">

{/* Header */}
<div className="flex items-center justify-between mb-4">
  <div className="flex items-center gap-3">
    <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
    <h1 className="text-xl font-bold text-gray-800">🛒 ขายของ</h1>
  </div>
  <div className="flex gap-2">
    <button onClick={() => setShowHeldOrders(true)}
      className="bg-yellow-100 text-yellow-700 text-sm px-3 py-2 rounded-xl">
      📌 พักบิล {heldOrders.length > 0 && `(${heldOrders.length})`}
    </button>
  </div>
</div>

{/* Pre-order Toggle */}
<div className="bg-white rounded-2xl p-3 shadow-sm mb-3 flex items-center justify-between">
  <div>
    <div className="font-bold text-sm text-gray-800">🔮 โหมดพรีออเดอร์</div>
    <div className="text-xs text-gray-400">เปิดเพื่อสั่งสินค้าที่หมดสต็อก</div>
  </div>
  <button onClick={() => setPreorderMode(!preorderMode)}
    className={`relative w-12 h-7 rounded-full transition-colors ${
      preorderMode ? 'bg-purple-500' : 'bg-gray-300'
    }`}>
    <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
      preorderMode ? 'translate-x-5' : 'translate-x-0.5'
    }`} />
  </button>
</div>

{/* Search + Scan */}
<div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
  <div className="flex gap-2">
    <input value={search} onChange={e => setSearch(e.target.value)}
      className="flex-1 border border-gray-200 rounded-xl p-2 text-sm"
      placeholder="🔍 ค้นหาสินค้า..." />
    <button onClick={startScanner}
      className="bg-orange-500 text-white px-3 rounded-xl text-lg">
      📷
    </button>
  </div>
</div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button onClick={() => setSelectedCategory('')}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              !selectedCategory ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'
            }`}>
            ทั้งหมด
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
                selectedCategory === c.id ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'
              }`}>
              {c.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">📦</div>
            <p>ยังไม่มีสินค้าค่ะ</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {filteredProducts
  .filter(p => preorderMode || p.stock_qty > 0)
  .map(product => {
              const inCart = cart.find(c => c.product_id === product.id)
              return (
<button key={product.id}
  onClick={() => addToCart(product)}
  disabled={product.stock_qty === 0 && !preorderMode}
  className={`bg-white rounded-2xl shadow-sm relative overflow-hidden text-left active:scale-95 transition-transform ${
    product.stock_qty === 0 && !preorderMode ? 'opacity-50' : ''
  } ${product.stock_qty === 0 && preorderMode ? 'ring-2 ring-purple-300' : ''}`}>

                  {/* Badge ในตะกร้า */}
                  {inCart && (
                    <div className="absolute top-1 right-1 bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center z-10">
                      {inCart.quantity}
                    </div>
                  )}

                  <div className="p-2">
                    {/* รูป */}
                    <div className="w-full aspect-square bg-gray-100 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" />
                      ) : (
                        <span className="text-2xl">🐱</span>
                      )}
                    </div>

                    {/* ชื่อ */}
                    <div className="font-medium text-xs text-gray-800 mb-1 line-clamp-2 min-h-[2rem]">
                      {product.name}
                    </div>

                    {/* ราคา */}
                    <div className="text-orange-500 font-bold text-sm">
                      {product.selling_price.toLocaleString()}฿
                    </div>

                    {/* สต็อก */}
                    <div className={`text-xs ${
                      product.stock_qty === 0
                        ? (preorderMode ? 'text-purple-500 font-bold' : 'text-red-500 font-bold')
                        : 'text-gray-400'
                            }`}>
                  {product.stock_qty === 0
     ? (preorderMode ? '🔮 พรีออเดอร์' : 'หมด')
    : `เหลือ ${product.stock_qty}`}
</div>


                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Barcode Scanner Modal */}
{showScanner && (
  <div className="fixed inset-0 bg-black z-50 flex flex-col">
    <div className="flex justify-between items-center p-4">
      <h3 className="font-bold text-white text-lg">📷 สแกนบาร์โค้ด</h3>
      <button onClick={stopScanner} className="text-white text-2xl">✕</button>
    </div>
    <div id="qr-reader" className="w-full flex-1" />
    <div className="p-4 text-center text-white text-sm opacity-70">
      ส่องกล้องไปที่บาร์โค้ดสินค้าค่ะ
    </div>
  </div>
)}

        {/* Floating Cart Button */}
        {cart.length > 0 && (
          <button onClick={() => setShowCart(true)}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white font-bold py-3 px-6 rounded-full shadow-lg flex items-center gap-2 z-30">
            🛒 ตะกร้า ({cartCount}) · {total.toLocaleString()}฿
          </button>
        )}

        {/* Cart Modal */}
        {showCart && (
          <div className="fixed inset-0 bg-black/50 z-40 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg">🛒 ตะกร้าสินค้า</h3>
                <button onClick={() => setShowCart(false)} className="text-gray-400 text-xl">✕</button>
              </div>

              {/* Cart Items */}
              <div className="space-y-2 mb-3">
                {cart.map((item, index) => (
                  <div key={index} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex gap-3">
                      <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.image_url ? (
                          <img src={item.image_url} className="w-full h-full object-contain p-1" />
                        ) : (
                          <span className="text-2xl">🐱</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="font-medium text-sm text-gray-800 line-clamp-2">{item.name}</div>
                          <button onClick={() => removeFromCart(index)} className="text-red-400 text-xs ml-2">✕</button>
                        </div>
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          <button onClick={() => updateQty(index, item.quantity - 1)}
                            className="w-7 h-7 bg-white rounded-lg text-gray-600 border border-gray-200">−</button>
                          <input type="number" value={item.quantity}
                            onChange={e => updateQty(index, Number(e.target.value))}
                            className="w-12 text-center border border-gray-200 rounded-lg p-1 text-sm" />
                          <button onClick={() => updateQty(index, item.quantity + 1)}
                            className="w-7 h-7 bg-white rounded-lg text-gray-600 border border-gray-200">+</button>
                          <span className="text-xs text-gray-400">×</span>
                          <input type="number" value={item.unit_price}
                            onChange={e => updatePrice(index, Number(e.target.value))}
                            className="w-16 text-center border border-gray-200 rounded-lg p-1 text-sm" />
                          <span className="text-xs text-gray-400">฿</span>
                        </div>
                        <div className="text-right text-sm font-bold text-orange-500 mt-1">
                          = {(item.unit_price * item.quantity).toLocaleString()}฿
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">ราคารวม</span>
                  <span>{subtotal.toLocaleString()}฿</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-500">ส่วนลด</span>
                  <input type="number" value={discount}
                    onChange={e => setDiscount(Number(e.target.value))}
                    className="w-24 text-right border border-gray-200 rounded-lg p-1 text-sm" />
                </div>
                <div className="flex justify-between items-center text-lg font-bold mt-2 pt-2 border-t border-gray-200">
                  <span>รวมทั้งสิ้น</span>
                  <span className="text-orange-500">{total.toLocaleString()}฿</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowHoldDialog(true)}
                  className="bg-yellow-100 text-yellow-700 font-bold py-3 rounded-xl">
                  📌 พักบิล
                </button>
                <button onClick={() => setShowCheckout(true)}
                  className="bg-orange-500 text-white font-bold py-3 rounded-xl">
                  ✅ สรุปยอด
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hold Order Dialog */}
        {showHoldDialog && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
              <h3 className="font-bold mb-3">พักบิล</h3>
              <input value={holdName}
                onChange={e => setHoldName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleHoldOrder()}
                autoFocus
                className="w-full border border-gray-200 rounded-xl p-2 text-sm mb-3"
                placeholder="ชื่อบิล/ลูกค้า" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowHoldDialog(false)}
                  className="bg-gray-100 text-gray-600 py-2 rounded-xl">ยกเลิก</button>
                <button onClick={handleHoldOrder} disabled={!holdName.trim()}
                  className="bg-yellow-500 text-white py-2 rounded-xl disabled:opacity-50">บันทึก</button>
              </div>
            </div>
          </div>
        )}

        {/* Held Orders Modal */}
        {showHeldOrders && (
          <div className="fixed inset-0 bg-black/50 z-40 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold">📌 บิลที่พักไว้</h3>
                <button onClick={() => setShowHeldOrders(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              {heldOrders.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">ไม่มีบิลที่พักไว้</p>
              ) : (
                <div className="space-y-2">
                  {heldOrders.map(o => (
                    <div key={o.id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{o.customer_name}</div>
                          <div className="text-xs text-gray-400">
                            {o.items.length} รายการ · {o.total.toLocaleString()}฿
                          </div>
                          <div className="text-xs text-gray-400">
                            {new Date(o.created_at).toLocaleString('th-TH')}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => loadHeldOrder(o)}
                            className="bg-orange-500 text-white text-xs px-3 py-1 rounded-lg">ดึงกลับ</button>
                          <button onClick={() => deleteHeldOrder(o.id)}
                            className="bg-red-100 text-red-500 text-xs px-3 py-1 rounded-lg">ลบ</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

{/* Slip Modal */}
{showSlip && (
  <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-lg">🧾 สลิปสินค้า</h3>
        <button onClick={() => { setShowSlip(false); setCopied(false) }}
          className="text-gray-400 text-xl">✕</button>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 rounded-xl p-3 mb-3 font-mono text-xs whitespace-pre-wrap text-gray-800 max-h-64 overflow-y-auto">
        {slipText}
      </div>

      {/* Copy button */}
      <button
        onClick={() => {
          navigator.clipboard.writeText(slipText)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
        className={`w-full font-bold py-3 rounded-2xl transition-colors ${
          copied
            ? 'bg-green-500 text-white'
            : 'bg-orange-500 text-white'
        }`}>
        {copied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกข้อความ'}
      </button>

      <button onClick={() => { setShowSlip(false); setCopied(false) }}
        className="w-full bg-gray-100 text-gray-600 font-bold py-3 rounded-2xl mt-2">
        ปิด
      </button>
    </div>
  </div>
)}

{/* Add Customer Dialog */}
{showAddCustomer && (
  <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
      <h3 className="font-bold mb-3">👤 เพิ่มลูกค้าใหม่</h3>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-500">ชื่อ *</label>
          <input value={newCustomerName}
            onChange={e => setNewCustomerName(e.target.value)}
            autoFocus
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            placeholder="ชื่อลูกค้า" />
        </div>
        <div>
          <label className="text-xs text-gray-500">เบอร์โทร</label>
          <input value={newCustomerPhone}
            onChange={e => setNewCustomerPhone(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            placeholder="08x-xxx-xxxx" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button onClick={() => { setShowAddCustomer(false); setNewCustomerName(''); setNewCustomerPhone('') }}
          className="bg-gray-100 text-gray-600 py-2 rounded-xl">ยกเลิก</button>
        <button onClick={handleAddNewCustomer}
          disabled={!newCustomerName.trim() || addingCustomer}
          className="bg-orange-500 text-white py-2 rounded-xl disabled:opacity-50">
          {addingCustomer ? 'กำลังบันทึก...' : '✅ เพิ่ม'}
        </button>
      </div>
    </div>
  </div>
)}

{showCheckout && (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
    <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg">สรุปยอด</h3>
        <button onClick={() => setShowCheckout(false)} className="text-gray-400 text-xl">✕</button>
      </div>

      <div className="space-y-3">

        {/* กล่องที่ 1: ลูกค้า + ส่ง */}
        <div className="bg-gray-50 rounded-2xl p-3 space-y-2">

          {/* ลูกค้า */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-gray-500">ลูกค้า</label>
              <button onClick={() => setShowAddCustomer(true)}
                className="text-xs text-orange-500 font-bold">
                + เพิ่มลูกค้าใหม่
              </button>
            </div>
            <input value={customerSearch}
              onChange={e => { setCustomerSearch(e.target.value); setCustomerId('') }}
              className="w-full border border-gray-200 rounded-xl p-2 text-sm bg-white"
              placeholder="ค้นหาลูกค้า (เว้นว่างถ้าไม่มีสมาชิก)" />
            {customerSearch && !customerId && filteredCustomers.length > 0 && (
              <div className="border border-gray-200 rounded-xl mt-1 max-h-36 overflow-y-auto bg-white">
                {filteredCustomers.slice(0, 5).map(c => (
                  <button key={c.id}
                    onClick={() => {
                      setCustomerId(c.id)
                      setCustomerSearch(c.name)
                      if (c.zone_id) setZoneId(c.zone_id)
                      if (c.address) setDeliveryAddress(c.address)
                    }}
                    className="w-full text-left p-2 border-b border-gray-100 hover:bg-gray-50 text-sm">
                    <div className="font-medium">{c.name}</div>
                    {c.phone && <div className="text-xs text-gray-400">{c.phone}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* สถานที่ส่ง + โซน */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">สถานที่ส่ง</label>
              <input value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm bg-white"
                placeholder="หอพัก/ห้อง" />
            </div>
            <div>
              <label className="text-xs text-gray-500">โซน</label>
              <select value={zoneId} onChange={e => setZoneId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm bg-white">
                <option value="">ไม่ระบุ</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
          </div>

          {/* วันที่ส่ง */}
          <div>
            <label className="text-xs text-gray-500">วันที่ส่ง</label>
            <input type="date" value={scheduledDate}
              onChange={e => setScheduledDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm bg-white" />
          </div>

        </div>

        {/* กล่องที่ 2: ชำระเงิน */}
        <div className="bg-gray-50 rounded-2xl p-3 space-y-2">

          {/* สถานะชำระเงิน */}
          <div>
            <label className="text-xs text-gray-500">สถานะชำระเงิน</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button onClick={() => setPaymentStatus('paid')}
                className={`py-2 rounded-xl text-sm font-medium ${
                  paymentStatus === 'paid' ? 'bg-green-500 text-white' : 'bg-white text-gray-600'
                }`}>
                ✅ จ่ายแล้ว
              </button>
              <button onClick={() => setPaymentStatus('pending')}
                className={`py-2 rounded-xl text-sm font-medium ${
                  paymentStatus === 'pending' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'
                }`}>
                ⏳ ค้างชำระ
              </button>
            </div>
          </div>

          {/* วิธีชำระ */}
          {paymentStatus === 'paid' && (
            <div>
              <label className="text-xs text-gray-500">วิธีชำระ</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button onClick={() => setPaymentMethod('cash')}
                  className={`py-2 rounded-xl text-sm font-medium ${
                    paymentMethod === 'cash' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'
                  }`}>
                  💵 เงินสด
                </button>
                <button onClick={() => setPaymentMethod('transfer')}
                  className={`py-2 rounded-xl text-sm font-medium ${
                    paymentMethod === 'transfer' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600'
                  }`}>
                  💳 โอน
                </button>
              </div>
            </div>
          )}

          {/* หมายเหตุ */}
          <div>
            <label className="text-xs text-gray-500">หมายเหตุ</label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm bg-white"
              rows={2} placeholder="หมายเหตุเพิ่มเติม" />
          </div>

        </div>

        {/* สรุปยอด */}
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">รายการ</span>
            <span>{cart.length} รายการ</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">ราคารวม</span>
            <span>{subtotal.toLocaleString()}฿</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ส่วนลด</span>
              <span className="text-green-500">-{discount.toLocaleString()}฿</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg mt-1">
            <span>รวมทั้งสิ้น</span>
            <span className="text-orange-500">{total.toLocaleString()}฿</span>
          </div>
        </div>

      </div>

      <button onClick={handleCheckout} disabled={saving}
        className="w-full bg-orange-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
        {saving ? 'กำลังบันทึก...' : '✅ ยืนยันการขาย'}
      </button>
    </div>
  </div>
)}

{/* Add Customer Dialog */}
{showAddCustomer && (
  <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
      <h3 className="font-bold mb-3">👤 เพิ่มลูกค้าใหม่</h3>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-gray-500">ชื่อ *</label>
          <input value={newCustomerName}
            onChange={e => setNewCustomerName(e.target.value)}
            autoFocus
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            placeholder="ชื่อลูกค้า" />
        </div>
        <div>
          <label className="text-xs text-gray-500">สถานที่ส่ง</label>
          <input value={deliveryAddress}
            onChange={e => setDeliveryAddress(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
            placeholder="หอพัก/ห้อง/ที่อยู่" />
        </div>
        <div>
          <label className="text-xs text-gray-500">โซน</label>
          <select value={zoneId} onChange={e => setZoneId(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
            <option value="">ไม่ระบุ</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button onClick={() => { setShowAddCustomer(false); setNewCustomerName('') }}
          className="bg-gray-100 text-gray-600 py-2 rounded-xl">ยกเลิก</button>
        <button onClick={handleAddNewCustomer}
          disabled={!newCustomerName.trim() || addingCustomer}
          className="bg-orange-500 text-white py-2 rounded-xl disabled:opacity-50">
          {addingCustomer ? 'กำลังบันทึก...' : '✅ เพิ่ม'}
        </button>
      </div>
    </div>
  </div>
)}

      </div>
    </main>
  )
}