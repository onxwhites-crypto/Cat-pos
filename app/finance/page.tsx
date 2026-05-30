'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type OrderItem = {
  quantity: number
  unit_price: number
  products: { avg_cost: number | null; name: string } | null
}
type Order = {
  id: string
  order_date: string
  created_at: string
  total: number
  payment_status: string
  customers: { name: string } | null
  order_items: OrderItem[]
}
type Expense = {
  id: string
  category: string
  amount: number
  note: string
  date: string
  stream: 'capital' | 'profit'
}
type DeliveryRound = {
  id: string
  stock_date: string
  delivery_date: string
  note: string | null
}
type StockReceipt = {
  id: string
  order_date: string
  received_at: string | null
  service_fee_actual: number
  cod_actual: number | null
  fee_payer: string | null
  payment_method: string | null
  platform_id: string | null
  platforms: { name: string } | null
  stock_receipt_items: { quantity: number; item_cost: number }[]
}
type StockLot = {
  id: string
  product_id: string
  platform_name: string | null
  quantity_in: number
  quantity_remaining: number
  order_date: string
}
type FinanceSetting = {
  key: string
  value: number
  label: string
}

const EXPENSE_CATEGORIES_CAPITAL = ['ค่าถุง/บรรจุภัณฑ์', 'ค่าโฆษณา', 'ค่าน้ำ-ไฟ', 'อื่นๆ (ทุน)']
const EXPENSE_CATEGORIES_PROFIT = ['ค่าน้ำมัน', 'ค่าโทรศัพท์', 'ค่าเดินทาง', 'อื่นๆ (กำไร)']

export default function FinancePage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [deliveryRounds, setDeliveryRounds] = useState<DeliveryRound[]>([])
  const [stockReceipts, setStockReceipts] = useState<StockReceipt[]>([])
  const [financeSettings, setFinanceSettings] = useState<FinanceSetting[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showAddRound, setShowAddRound] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'calendar' | 'daily' | 'summary'>('calendar')
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0])
  const [stockLots, setStockLots] = useState<StockLot[]>([])

  const [form, setForm] = useState({
    category: 'ค่าถุง/บรรจุภัณฑ์',
    amount: '',
    note: '',
    date: new Date().toISOString().split('T')[0],
    stream: 'capital' as 'capital' | 'profit',
  })
  const [roundForm, setRoundForm] = useState({
    stock_date: new Date().toISOString().split('T')[0],
    delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    note: '',
  })
  const [editingRound, setEditingRound] = useState<DeliveryRound | null>(null)
  const [settingsForm, setSettingsForm] = useState<{ [key: string]: number }>({})

  useEffect(() => { fetchData() }, [currentMonth])

  async function fetchData() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const fromDate = new Date(year, month, 1).toISOString().split('T')[0]
    const toDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

    const [{ data: o }, { data: e }, { data: r }, { data: fs }] = await Promise.all([
    supabase.from('orders')
      .select('id, order_date, created_at, total, payment_status, customers(name), order_items(quantity, unit_price, products(avg_cost, name))')
      .gte('order_date', fromDate + 'T00:00:00+07:00')
      .lte('order_date', toDate + 'T23:59:59+07:00')
      .eq('payment_status', 'paid')
      .neq('status', 'cancelled')
      .order('order_date', { ascending: false }),
      supabase.from('expenses')
        .select('*').gte('date', fromDate).lte('date', toDate)
        .order('date', { ascending: false }),
      supabase.from('delivery_rounds').select('*').order('stock_date', { ascending: false }),
      supabase.from('finance_settings').select('*'),
    ])

      const { data: sr } = await supabase
        .from('stock_receipts')
        .select('id, order_date, received_at, service_fee_actual, cod_actual, fee_payer, payment_method, platform_id, platforms(name), stock_receipt_items(quantity, item_cost)')
        .or(`order_date.gte.${fromDate},received_at.gte.${fromDate}`)

        const { data: lots } = await supabase
  .from('stock_lots')
  .select('id, product_id, platform_name, quantity_in, quantity_remaining, order_date')
  .gte('order_date', fromDate)
  .lte('order_date', toDate)

    setOrders((o || []) as any)
    setExpenses(e || [])
    setDeliveryRounds(r || [])
    setStockReceipts((sr || []) as any)
    setStockLots((lots || []) as any)
    setFinanceSettings(fs || [])
    const settingsMap: { [key: string]: number } = {}
    ;(fs || []).forEach((s: FinanceSetting) => { settingsMap[s.key] = s.value })
    setSettingsForm(settingsMap)
  }

  function getDateStr(day: number) {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function getDaysInMonth() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    return {
      firstDay: new Date(year, month, 1).getDay(),
      daysInMonth: new Date(year, month + 1, 0).getDate(),
    }
  }

  // ─── helper แยก COD/fee ตามผู้จ่าย ───
  function getCODAmount(r: StockReceipt): number {
    return r.cod_actual ?? r.stock_receipt_items.reduce((s, i) => s + i.item_cost, 0)
  }

  function isCODPayerSelf(r: StockReceipt): boolean {
    // ถ้าไม่มี cod_payer field ใน receipt ให้ถือว่าเราจ่าย (backward compat)
    // จริงๆ cod_payer อยู่ใน stock_receipts แต่ตอนนี้ยังไม่ได้ query มา
    // ใช้ fee_payer เป็น proxy ก่อน — ถ้า fee_payer = white แปลว่าไวท์จ่ายทุกอย่าง
    return r.fee_payer !== 'white'
  }

  function calcDay(dateStr: string) {
    const dayOrders = orders.filter(o => o.order_date?.substring(0, 10) === dateStr)
    const sales = dayOrders.reduce((s, o) => s + o.total, 0)
    const cost = dayOrders.reduce((s, o) => s + o.order_items.reduce((ss, i) => ss + ((i.products?.avg_cost || 0) * i.quantity), 0), 0)
    const grossProfit = sales - cost

    // receipts วันนี้ (order_date)
    const dayReceipts = stockReceipts.filter(r => r.order_date?.startsWith(dateStr))

    // ค่ากด — แยกตามผู้จ่าย
    const totalFeeSelf = dayReceipts
      .filter(r => r.fee_payer !== 'white')
      .reduce((s, r) => s + (r.service_fee_actual || 0), 0)
    const totalFeeWhite = dayReceipts
      .filter(r => r.fee_payer === 'white')
      .reduce((s, r) => s + (r.service_fee_actual || 0), 0)

    // COD วันที่รับของ — แยกตามผู้จ่าย
    const receivedReceipts = stockReceipts.filter(r => r.received_at?.startsWith(dateStr))
    const totalCODSelf = receivedReceipts
      .filter(r => r.fee_payer !== 'white')
      .reduce((s, r) => s + getCODAmount(r), 0)
    const totalCODWhite = receivedReceipts
      .filter(r => r.fee_payer === 'white')
      .reduce((s, r) => s + getCODAmount(r), 0)

    // พร้อมเพย์ — บันทึกตอนสั่ง
    const promptpayReceipts = dayReceipts.filter(r => r.payment_method === 'promptpay')
    const totalPromptpay = promptpayReceipts.reduce((s, r) =>
      s + r.stock_receipt_items.reduce((ss, i) => ss + i.item_cost, 0), 0)

    const capitalExpenses = expenses.filter(e => e.date === dateStr && e.stream === 'capital').reduce((s, e) => s + e.amount, 0)
    const profitExpenses = expenses.filter(e => e.date === dateStr && e.stream === 'profit').reduce((s, e) => s + e.amount, 0)

    // รายจ่ายสายทุน = ต้นทุน + ค่ากด(เรา) + COD(เรา) + พร้อมเพย์ + อื่นๆ
    const capitalOut = cost + totalFeeSelf + totalCODSelf + capitalExpenses

    const capitalBalance = sales - capitalOut
    const profitBalance = grossProfit - profitExpenses

    return {
      sales, cost, grossProfit,
      totalFeeSelf, totalFeeWhite,
      totalCODSelf, totalCODWhite,
      totalPromptpay,
      capitalExpenses, profitExpenses,
      capitalOut, capitalBalance, profitBalance,
      hasData: sales > 0 || totalFeeWhite > 0 || totalFeeWhite > 0 || totalCODSelf > 0 || totalCODWhite > 0,
    }
  }

  const monthlyCapital = (() => {
    const sales = orders.reduce((s, o) => s + o.total, 0)
    const cost = orders.reduce((s, o) => s + o.order_items.reduce((ss, i) => ss + ((i.products?.avg_cost || 0) * i.quantity), 0), 0)

    const totalFeeSelf = stockReceipts
      .filter(r => r.fee_payer !== 'white')
      .reduce((s, r) => s + (r.service_fee_actual || 0), 0)
    const totalFeeWhite = stockReceipts
      .filter(r => r.fee_payer === 'white')
      .reduce((s, r) => s + (r.service_fee_actual || 0), 0)

    const receivedReceipts = stockReceipts.filter(r => r.received_at)
    const totalCODSelf = receivedReceipts
      .filter(r => r.fee_payer !== 'white')
      .reduce((s, r) => s + getCODAmount(r), 0)
    const totalCODWhite = receivedReceipts
      .filter(r => r.fee_payer === 'white')
      .reduce((s, r) => s + getCODAmount(r), 0)

    const capitalExp = expenses.filter(e => e.stream === 'capital').reduce((s, e) => s + e.amount, 0)
    const profitExp = expenses.filter(e => e.stream === 'profit').reduce((s, e) => s + e.amount, 0)
    const grossProfit = sales - cost
    const capitalOut = cost + totalFeeSelf + totalCODSelf + capitalExp

    return {
      sales, cost, totalFeeSelf, totalFeeWhite,
      totalCODSelf, totalCODWhite,
      capitalExp, profitExp, grossProfit,
      capitalOut, capitalBalance: sales - capitalOut,
      profitBalance: grossProfit - profitExp,
    }
  })()

  function calcPlatformSales(dateStr: string) {
  const dayOrders = orders.filter(o => o.order_date?.substring(0, 10) === dateStr)
  
  const soldByProduct: { [productId: string]: number } = {}
  dayOrders.forEach(o => {
    o.order_items.forEach((i: any) => {
      soldByProduct[i.product_id] = (soldByProduct[i.product_id] || 0) + i.quantity
    })
  })

  const platformSales: { [platform: string]: number } = {}
  
  for (const [productId, qtySold] of Object.entries(soldByProduct)) {
    const lots = stockLots
      .filter(l => l.product_id === productId)
      .sort((a, b) => a.order_date.localeCompare(b.order_date))
    
    let remaining = qtySold
    for (const lot of lots) {
      if (remaining <= 0) break
      const take = Math.min(remaining, lot.quantity_remaining)
      if (take <= 0) continue
      const platform = lot.platform_name || 'อื่นๆ'
      platformSales[platform] = (platformSales[platform] || 0) + take
      remaining -= take
    }
  }
  
  return platformSales
}

  function isStockDate(d: string) { return deliveryRounds.some(r => r.stock_date === d) }
  function isDeliveryDate(d: string) { return deliveryRounds.some(r => r.delivery_date === d) }
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  const monthName = currentMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
  const { firstDay, daysInMonth } = getDaysInMonth()
  const thisMonthRounds = deliveryRounds.filter(r => r.stock_date.startsWith(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`))
  const daily = calcDay(dailyDate)
  const totalPct = Object.values(settingsForm).reduce((s, v) => s + v, 0)

  async function handleAddExpense() {
    if (!form.amount || Number(form.amount) <= 0) return
    setSaving(true)
    await supabase.from('expenses').insert({
      category: form.category, amount: Number(form.amount),
      note: form.note || null, date: form.date, stream: form.stream,
    })
    setForm({ category: 'ค่าถุง/บรรจุภัณฑ์', amount: '', note: '', date: new Date().toISOString().split('T')[0], stream: 'capital' })
    setShowAddExpense(false)
    fetchData()
    setSaving(false)
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await supabase.from('expenses').delete().eq('id', id)
    fetchData()
  }

  async function handleAddRound() {
    if (!roundForm.stock_date || !roundForm.delivery_date) return
    setSaving(true)
    if (editingRound) {
      await supabase.from('delivery_rounds').update({ stock_date: roundForm.stock_date, delivery_date: roundForm.delivery_date, note: roundForm.note || null }).eq('id', editingRound.id)
    } else {
      await supabase.from('delivery_rounds').insert({ stock_date: roundForm.stock_date, delivery_date: roundForm.delivery_date, note: roundForm.note || null })
    }
    setShowAddRound(false); setEditingRound(null)
    setRoundForm({ stock_date: new Date().toISOString().split('T')[0], delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], note: '' })
    fetchData(); setSaving(false)
  }

  async function handleDeleteRound(id: string) {
    if (!confirm('ลบรอบลงของนี้?')) return
    await supabase.from('delivery_rounds').delete().eq('id', id)
    fetchData()
  }

  async function handleSaveSettings() {
    setSaving(true)
    for (const [key, value] of Object.entries(settingsForm)) {
      await supabase.from('finance_settings').update({ value }).eq('key', key)
    }
    setShowSettings(false)
    fetchData()
    setSaving(false)
    alert('บันทึกเรียบร้อยค่ะ ✅')
  }

  return (
    <main className="min-h-screen bg-[#fff5f3]">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform">←</button>
            <h1 className="text-lg font-bold text-gray-800">💰 การเงิน</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(true)} className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-base active:scale-95 transition-transform">⚙️</button>
            <button onClick={() => { setEditingRound(null); setRoundForm({ stock_date: new Date().toISOString().split('T')[0], delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], note: '' }); setShowAddRound(true) }}
              className="bg-gradient-to-r from-blue-400 to-sky-400 text-white text-xs px-3 py-2 rounded-xl font-semibold active:scale-95 transition-transform">📦 ลงของ</button>
            <button onClick={() => setShowAddExpense(true)} className="bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs px-3 py-2 rounded-xl font-semibold active:scale-95 transition-transform">+ รายจ่าย</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[{ key: 'calendar', label: '📅 ปฏิทิน' }, { key: 'daily', label: '📊 รายวัน' }, { key: 'summary', label: '📈 สรุปเดือน' }].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              className={`py-2.5 rounded-2xl text-xs font-bold transition-all ${activeTab === t.key ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-8 pt-2 space-y-3">

        {/* ══ TAB: ปฏิทิน ══ */}
        {activeTab === 'calendar' && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth} className="text-gray-500 text-xl px-2 active:scale-95">‹</button>
                <h2 className="font-bold text-gray-800">{monthName}</h2>
                <button onClick={nextMonth} className="text-gray-500 text-xl px-2 active:scale-95">›</button>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d => <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const dateStr = getDateStr(day)
                  const d = calcDay(dateStr)
                  const isSelected = selectedDate === dateStr
                  const isToday = dateStr === new Date().toISOString().split('T')[0]
                  return (
                    <button key={day} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`rounded-xl p-1 min-h-[56px] text-left transition-all ${isSelected ? 'bg-amber-100 ring-2 ring-amber-400' : isToday ? 'bg-orange-50 ring-1 ring-orange-300' : d.hasData ? 'bg-green-50' : 'bg-gray-50'}`}>
                      <div className="flex justify-between items-center px-0.5 mb-0.5">
                        <div className="text-[9px]">
                          {isStockDate(dateStr) && '📦'}
                          {isDeliveryDate(dateStr) && '🛵'}
                        </div>
                        <div className={`text-xs font-bold ${isToday ? 'text-orange-500' : 'text-gray-700'}`}>{day}</div>
                      </div>
                      {d.hasData && (
                        <>
                          <div className="text-center text-[9px] text-rose-500 font-medium leading-tight">{d.cost > 0 ? d.cost.toFixed(0) : ''}</div>
                          <div className={`text-center text-[9px] font-medium leading-tight ${d.grossProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{d.grossProfit > 0 ? d.grossProfit.toFixed(0) : ''}</div>
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-3 mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
                <span>📦 ลงของ</span><span>🛵 ส่งของ</span>
                <span className="text-rose-500">ทุน</span>
                <span className="text-green-600">กำไร</span>
              </div>
            </div>

            {selectedDate && (() => {
              const d = calcDay(selectedDate)
              const selOrders = orders.filter(o => o.order_date?.substring(0, 10) === selectedDate)
              const selExpenses = expenses.filter(e => e.date === selectedDate)
              const selSales = selOrders.reduce((s, o) => s + o.total, 0)
              const selCost = selOrders.reduce((s, o) => s + o.order_items.reduce((ss, i) => ss + ((i.products?.avg_cost || 0) * i.quantity), 0), 0)
              const selProfit = selSales - selCost
              return (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="font-bold text-gray-700">
                      📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: '2-digit' })}
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                    <div className="text-center">
                      <div className="text-xs text-gray-400">ยอดขาย</div>
                      <div className="font-bold text-green-600">{selSales.toLocaleString()}฿</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400">ต้นทุน</div>
                      <div className="font-bold text-gray-600">{selCost.toFixed(0)}฿</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-400">กำไร</div>
                      <div className={`font-bold ${selProfit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{selProfit.toFixed(0)}฿</div>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    {selOrders.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-4">ไม่มีออเดอร์วันนี้ค่ะ</p>
                    ) : selOrders.map(o => {
                      const orderCost = o.order_items.reduce((s, i) => s + ((i.products?.avg_cost || 0) * i.quantity), 0)
                      const orderProfit = o.total - orderCost
                      return (
                        <div key={o.id} className="bg-gray-50 rounded-xl p-3">
                          <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
                            <div className="font-bold text-sm text-gray-800">{o.customers?.name || 'ลูกค้าทั่วไป'}</div>
                            <div className="font-bold text-orange-500">{o.total.toLocaleString()}฿</div>
                          </div>
                          {o.order_items.map((item, idx) => {
                            const itemCost = (item.products?.avg_cost || 0) * item.quantity
                            const itemSales = item.unit_price * item.quantity
                            const itemProfit = itemSales - itemCost
                            return (
                              <div key={idx}>
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-gray-700 flex-1 truncate">{item.products?.name || '-'}</span>
                                  <span className="text-gray-400 mx-2">×{item.quantity}</span>
                                  <span className="font-medium text-gray-800">{itemSales.toLocaleString()}฿</span>
                                </div>
                                <div className="flex gap-3 text-xs mt-0.5">
                                  <span className="text-red-500">ทุน {itemCost.toFixed(0)}฿</span>
                                  <span className={itemProfit >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>กำไร {itemProfit.toFixed(0)}฿</span>
                                </div>
                              </div>
                            )
                          })}
                          <div className="flex gap-4 text-xs mt-2 pt-2 border-t border-gray-200">
                            <span className="text-red-500 font-medium">รวมทุน {orderCost.toFixed(0)}฿</span>
                            <span className={`font-medium ${orderProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>รวมกำไร {orderProfit.toFixed(0)}฿</span>
                          </div>
                        </div>
                      )
                    })}
                    {selExpenses.length > 0 && (
                      <div className="border-t border-gray-100 pt-3">
                        <p className="text-xs text-gray-500 font-bold mb-2">💸 รายจ่าย</p>
                        {selExpenses.map(e => (
                          <div key={e.id} className="flex justify-between text-sm py-1">
                            <span className="text-gray-600">{e.category}{e.note ? ` (${e.note})` : ''}</span>
                            <span className="text-red-500 font-medium">-{e.amount.toLocaleString()}฿</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {thisMonthRounds.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-bold text-gray-700 mb-2">📦 รอบลงของเดือนนี้</h3>
                <div className="space-y-2">
                  {thisMonthRounds.map(r => (
                    <div key={r.id} className="flex justify-between items-center bg-gray-50 rounded-xl px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800">
                          📦 {new Date(r.stock_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                          {' → '}
                          🛵 {new Date(r.delivery_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </div>
                        {r.note && <div className="text-xs text-gray-400 mt-0.5">{r.note}</div>}
                      </div>
                      <div className="flex gap-1.5 ml-2">
                        <button onClick={() => { setEditingRound(r); setRoundForm({ stock_date: r.stock_date, delivery_date: r.delivery_date, note: r.note || '' }); setShowAddRound(true) }}
                          className="text-blue-500 text-xs bg-blue-50 px-2.5 py-1.5 rounded-xl active:scale-95">✏️</button>
                        <button onClick={() => handleDeleteRound(r.id)}
                          className="text-red-400 text-xs bg-red-50 px-2.5 py-1.5 rounded-xl active:scale-95">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ TAB: รายวัน ══ */}
        {activeTab === 'daily' && (
          <>
            <div className="bg-white rounded-2xl p-3 shadow-sm">
              <label className="text-xs text-gray-400">เลือกวันที่</label>
              <div className="flex gap-2 mt-1">
                <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
                  className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none" />
                <button onClick={() => setDailyDate(new Date().toISOString().split('T')[0])}
                  className="bg-gradient-to-r from-orange-400 to-rose-400 text-white text-xs px-4 rounded-xl font-semibold">วันนี้</button>
              </div>
            </div>

            <h3 className="font-bold text-gray-700 text-sm px-1">
              {new Date(dailyDate + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h3>

            <div className="grid grid-cols-2 gap-2">
              {/* สายทุน */}
              <div className="bg-blue-50 rounded-2xl p-3 shadow-sm">
                <p className="text-xs font-bold text-blue-700 mb-3 text-center">🏦 สายทุน</p>
                <div className="space-y-2 text-xs">
                  <div className="bg-white rounded-xl p-2">
                    <p className="text-gray-400 mb-0.5">รายรับ</p>
                    <p className="font-bold text-green-600 text-base">{daily.sales.toLocaleString()}฿</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 space-y-1">
                    <p className="text-gray-400 font-semibold">รายจ่าย (เราจ่าย)</p>
                    {daily.cost > 0 && <div className="flex justify-between"><span className="text-gray-500">ต้นทุน</span><span className="text-red-400">{daily.cost.toFixed(0)}</span></div>}
                    {daily.totalFeeSelf > 0 && <div className="flex justify-between"><span className="text-gray-500">ค่ากด</span><span className="text-red-400">{daily.totalFeeSelf.toFixed(0)}</span></div>}
                    {daily.totalCODSelf > 0 && <div className="flex justify-between"><span className="text-gray-500">COD</span><span className="text-red-400">{daily.totalCODSelf.toFixed(0)}</span></div>}
                    {daily.capitalExpenses > 0 && <div className="flex justify-between"><span className="text-gray-500">อื่นๆ</span><span className="text-red-400">{daily.capitalExpenses.toFixed(0)}</span></div>}
                    {daily.cost === 0 && daily.totalFeeSelf === 0 && daily.totalCODSelf === 0 && daily.capitalExpenses === 0 && <p className="text-gray-300 text-center py-1">-</p>}
                  </div>
                  <div className={`rounded-xl p-2 text-center ${daily.capitalBalance >= 0 ? 'bg-blue-100' : 'bg-red-50'}`}>
                    <p className="text-xs text-gray-500">คงเหลือ</p>
                    <p className={`font-bold text-lg ${daily.capitalBalance >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{daily.capitalBalance.toFixed(0)}฿</p>
                  </div>
                </div>
              </div>

              {/* สายกำไร */}
              <div className="bg-green-50 rounded-2xl p-3 shadow-sm">
                <p className="text-xs font-bold text-green-700 mb-3 text-center">💰 สายกำไร</p>
                <div className="space-y-2 text-xs">
                  <div className="bg-white rounded-xl p-2">
                    <p className="text-gray-400 mb-0.5">กำไรขั้นต้น</p>
                    <p className="font-bold text-green-600 text-base">{daily.grossProfit.toFixed(0)}฿</p>
                  </div>
                  <div className="bg-white rounded-xl p-2 space-y-1">
                    <p className="text-gray-400">รายจ่าย</p>
                    {expenses.filter(e => e.date === dailyDate && e.stream === 'profit').map(e => (
                      <div key={e.id} className="flex justify-between">
                        <span className="text-gray-500 truncate flex-1">{e.category}</span>
                        <span className="text-red-400 ml-1">{e.amount}</span>
                      </div>
                    ))}
                    {daily.profitExpenses === 0 && <p className="text-gray-300 text-center py-1">-</p>}
                  </div>
                  <div className={`rounded-xl p-2 text-center ${daily.profitBalance >= 0 ? 'bg-green-100' : 'bg-red-50'}`}>
                    <p className="text-xs text-gray-500">กำไรสุทธิ</p>
                    <p className={`font-bold text-lg ${daily.profitBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>{daily.profitBalance.toFixed(0)}฿</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── ไวท์จ่ายแทน ─── */}
            {(daily.totalFeeWhite > 0 || daily.totalCODWhite > 0) && (
              <div className="bg-sky-50 rounded-2xl p-3 shadow-sm border border-sky-100">
                <p className="text-xs font-bold text-sky-700 mb-2">💙 ไวท์จ่ายแทน (ไม่นับในสายทุน)</p>
                <div className="space-y-1.5 text-xs">
                  {daily.totalFeeWhite > 0 && (
                    <div className="flex justify-between bg-white rounded-xl px-3 py-2">
                      <span className="text-gray-500">ค่ากด (ไวท์จ่าย)</span>
                      <span className="font-bold text-sky-600">{daily.totalFeeWhite.toFixed(2)}฿</span>
                    </div>
                  )}
                  {daily.totalCODWhite > 0 && (
                    <div className="flex justify-between bg-white rounded-xl px-3 py-2">
                      <span className="text-gray-500">COD (ไวท์จ่าย)</span>
                      <span className="font-bold text-sky-600">{daily.totalCODWhite.toFixed(2)}฿</span>
                    </div>
                  )}
                  <div className="flex justify-between bg-sky-100 rounded-xl px-3 py-2">
                    <span className="font-bold text-sky-700">รวมที่ต้องคืนไวท์</span>
                    <span className="font-bold text-sky-700">{(daily.totalFeeWhite + daily.totalCODWhite).toFixed(2)}฿</span>
                  </div>
                </div>
              </div>
            )}

{/* ─── แยกต้นทุนตาม Platform (FIFO) ─── */}
{(() => {
  const platformSales = calcPlatformSales(dailyDate)
  const entries = Object.entries(platformSales)
  if (entries.length === 0) return null
  const shopeeAmt = entries
    .filter(([p]) => p.toLowerCase().includes('shopee'))
    .reduce((s, [, q]) => {
      const avgCost = orders
        .filter(o => o.order_date === dailyDate || o.created_at?.startsWith(dailyDate))
        .flatMap(o => o.order_items)
        .reduce((sum, i) => sum + (i.products?.avg_cost || 0) * i.quantity, 0) /
        Math.max(1, orders
          .filter(o => o.order_date === dailyDate || o.created_at?.startsWith(dailyDate))
          .flatMap(o => o.order_items)
          .reduce((sum, i) => sum + i.quantity, 0))
      return s + q * avgCost
    }, 0)
  return (
    <div className="bg-orange-50 rounded-2xl p-3 shadow-sm border border-orange-100">
      <p className="text-xs font-bold text-orange-700 mb-2">🛍️ แยกยอดขายตามแพลตฟอร์ม (FIFO)</p>
      <div className="space-y-1.5 text-xs">
        {entries.map(([platform, qty]) => {
          const isShopee = platform.toLowerCase().includes('shopee')
          return (
            <div key={platform} className="flex justify-between bg-white rounded-xl px-3 py-2">
              <span className="text-gray-500">
                {isShopee ? '🟠' : '🎵'} {platform}
              </span>
              <span className={`font-bold ${isShopee ? 'text-orange-500' : 'text-gray-600'}`}>
                {qty} ชิ้น
              </span>
            </div>
          )
        })}
        {shopeeAmt > 0 && (
          <div className="flex justify-between bg-orange-100 rounded-xl px-3 py-2">
            <span className="font-bold text-orange-700">เก็บไว้ใน Shopee wallet</span>
            <span className="font-bold text-orange-700">~{shopeeAmt.toFixed(0)}฿</span>
          </div>
        )}
      </div>
    </div>
  )
})()}

            {/* แบ่งเงินเก็บ */}
            {daily.profitBalance > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="font-bold text-gray-700 text-sm">🐱 แบ่งเงินเก็บ</p>
                  <p className="text-xs text-gray-400">จากกำไร {daily.profitBalance.toFixed(0)}฿</p>
                </div>
                <div className="space-y-2">
                  {financeSettings.map(s => (
                    <div key={s.key} className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">{s.label} ({s.value}%)</span>
                      <span className="font-bold text-gray-800">{((daily.profitBalance * s.value) / 100).toFixed(2)}฿</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold pt-2 border-t border-gray-100 text-sm">
                    <span className="text-gray-700">รวม {totalPct}%</span>
                    <span className={totalPct === 100 ? 'text-teal-500' : 'text-amber-500'}>{((daily.profitBalance * totalPct) / 100).toFixed(2)}฿</span>
                  </div>
                </div>
              </div>
            )}

            {/* รายจ่ายวันนี้ */}
            {expenses.filter(e => e.date === dailyDate).length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="font-bold text-gray-700 text-sm mb-2">💸 รายจ่ายวันนี้</p>
                <div className="space-y-1.5">
                  {expenses.filter(e => e.date === dailyDate).map(e => (
                    <div key={e.id} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${e.stream === 'capital' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                          {e.stream === 'capital' ? 'ทุน' : 'กำไร'}
                        </span>
                        <span className="text-gray-600">{e.category}</span>
                        {e.note && <span className="text-gray-400 text-xs">({e.note})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-red-500 font-bold">-{e.amount.toLocaleString()}฿</span>
                        <button onClick={() => handleDeleteExpense(e.id)} className="text-gray-300 active:scale-95">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ TAB: สรุปเดือน ══ */}
        {activeTab === 'summary' && (
          <>
            <div className="flex items-center justify-between mb-1">
              <button onClick={prevMonth} className="text-gray-500 text-xl px-2 active:scale-95">‹</button>
              <h2 className="font-bold text-gray-800">{monthName}</h2>
              <button onClick={nextMonth} className="text-gray-500 text-xl px-2 active:scale-95">›</button>
            </div>

            {/* สายทุน */}
            <div className="bg-blue-50 rounded-2xl p-4 shadow-sm">
              <p className="font-bold text-blue-700 mb-3">🏦 สายทุน</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">ยอดขายรวม</span><span className="font-bold text-green-600">+{monthlyCapital.sales.toLocaleString()}฿</span></div>
                <div className="flex justify-between"><span className="text-gray-500">ต้นทุนสินค้า</span><span className="text-red-400">-{monthlyCapital.cost.toFixed(2)}฿</span></div>
                {monthlyCapital.totalFeeSelf > 0 && <div className="flex justify-between"><span className="text-gray-500">ค่ากด (เราจ่าย)</span><span className="text-red-400">-{monthlyCapital.totalFeeSelf.toFixed(2)}฿</span></div>}
                {monthlyCapital.totalCODSelf > 0 && <div className="flex justify-between"><span className="text-gray-500">COD (เราจ่าย)</span><span className="text-red-400">-{monthlyCapital.totalCODSelf.toFixed(2)}฿</span></div>}
                {monthlyCapital.capitalExp > 0 && <div className="flex justify-between"><span className="text-gray-500">รายจ่ายทุนอื่นๆ</span><span className="text-red-400">-{monthlyCapital.capitalExp.toFixed(2)}฿</span></div>}
                <div className="flex justify-between font-bold pt-2 border-t border-blue-200 text-base">
                  <span className="text-blue-700">คงเหลือสายทุน</span>
                  <span className={monthlyCapital.capitalBalance >= 0 ? 'text-blue-600' : 'text-red-500'}>{monthlyCapital.capitalBalance.toFixed(2)}฿</span>
                </div>
              </div>
            </div>

            {/* ไวท์จ่ายแทน */}
            {(monthlyCapital.totalFeeWhite > 0 || monthlyCapital.totalCODWhite > 0) && (
              <div className="bg-sky-50 rounded-2xl p-4 shadow-sm border border-sky-100">
                <p className="font-bold text-sky-700 mb-3">💙 ไวท์จ่ายแทน (ไม่นับในสายทุน)</p>
                <div className="space-y-1.5 text-sm">
                  {monthlyCapital.totalFeeWhite > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">ค่ากด (ไวท์จ่าย)</span><span className="font-bold text-sky-600">{monthlyCapital.totalFeeWhite.toFixed(2)}฿</span></div>
                  )}
                  {monthlyCapital.totalCODWhite > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">COD (ไวท์จ่าย)</span><span className="font-bold text-sky-600">{monthlyCapital.totalCODWhite.toFixed(2)}฿</span></div>
                  )}
                  <div className="flex justify-between font-bold pt-2 border-t border-sky-200">
                    <span className="text-sky-700">รวมที่ต้องคืนไวท์</span>
                    <span className="text-sky-700">{(monthlyCapital.totalFeeWhite + monthlyCapital.totalCODWhite).toFixed(2)}฿</span>
                  </div>
                </div>
              </div>
            )}

            {/* สายกำไร */}
            <div className="bg-green-50 rounded-2xl p-4 shadow-sm">
              <p className="font-bold text-green-700 mb-3">💰 สายกำไร</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">กำไรขั้นต้น</span><span className="font-bold text-green-600">+{monthlyCapital.grossProfit.toFixed(2)}฿</span></div>
                {monthlyCapital.profitExp > 0 && <div className="flex justify-between"><span className="text-gray-500">รายจ่ายส่วนตัว</span><span className="text-red-400">-{monthlyCapital.profitExp.toFixed(2)}฿</span></div>}
                <div className="flex justify-between font-bold pt-2 border-t border-green-200 text-base">
                  <span className="text-green-700">กำไรสุทธิ</span>
                  <span className={monthlyCapital.profitBalance >= 0 ? 'text-green-600' : 'text-red-500'}>{monthlyCapital.profitBalance.toFixed(2)}฿</span>
                </div>
              </div>
            </div>

            {monthlyCapital.profitBalance > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="font-bold text-gray-700">🐱 แบ่งเงินเก็บเดือนนี้</p>
                  <p className="text-xs text-gray-400">จาก {monthlyCapital.profitBalance.toFixed(0)}฿</p>
                </div>
                <div className="space-y-2">
                  {financeSettings.map(s => (
                    <div key={s.key} className="flex justify-between items-center text-sm bg-gray-50 rounded-xl px-3 py-2">
                      <span className="text-gray-600">{s.label} <span className="text-gray-400">({s.value}%)</span></span>
                      <span className="font-bold text-gray-800">{((monthlyCapital.profitBalance * s.value) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}฿</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {expenses.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="font-bold text-gray-700 mb-3">💸 รายจ่ายเดือนนี้</p>
                <div className="space-y-1.5">
                  {expenses.map(e => (
                    <div key={e.id} className="flex justify-between items-start py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${e.stream === 'capital' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                            {e.stream === 'capital' ? 'ทุน' : 'กำไร'}
                          </span>
                          <span className="text-sm font-medium">{e.category}</span>
                        </div>
                        {e.note && <div className="text-xs text-gray-400 ml-8">{e.note}</div>}
                        <div className="text-xs text-gray-400 ml-8">{new Date(e.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-red-500">-{e.amount.toLocaleString()}฿</span>
                        <button onClick={() => handleDeleteExpense(e.id)} className="text-red-300 active:scale-95">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ Add Expense Modal ══ */}
      {showAddExpense && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">เพิ่มรายจ่าย</h3>
              <button onClick={() => setShowAddExpense(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => setForm({ ...form, stream: 'capital', category: 'ค่าถุง/บรรจุภัณฑ์' })}
                className={`py-3 rounded-2xl text-sm font-bold transition-all ${form.stream === 'capital' ? 'bg-blue-500 text-white' : 'bg-white text-gray-400 shadow-sm'}`}>
                🏦 สายทุน
              </button>
              <button onClick={() => setForm({ ...form, stream: 'profit', category: 'ค่าน้ำมัน' })}
                className={`py-3 rounded-2xl text-sm font-bold transition-all ${form.stream === 'profit' ? 'bg-green-500 text-white' : 'bg-white text-gray-400 shadow-sm'}`}>
                💰 สายกำไร
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">หมวดหมู่</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm">
                  {(form.stream === 'capital' ? EXPENSE_CATEGORIES_CAPITAL : EXPENSE_CATEGORIES_PROFIT).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">จำนวนเงิน (฿) *</label>
                <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="0" autoFocus />
              </div>
              <div>
                <label className="text-xs text-gray-500">วันที่</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">หมายเหตุ</label>
                <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="รายละเอียด" />
              </div>
            </div>
            <button onClick={handleAddExpense} disabled={saving || !form.amount}
              className={`w-full text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95 transition-transform ${form.stream === 'capital' ? 'bg-blue-500' : 'bg-green-500'}`}>
              {saving ? 'กำลังบันทึก...' : `✅ เพิ่มรายจ่าย${form.stream === 'capital' ? 'สายทุน' : 'สายกำไร'}`}
            </button>
          </div>
        </div>
      )}

      {/* ══ Add/Edit Round Modal ══ */}
      {showAddRound && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">{editingRound ? '✏️ แก้ไขรอบลงของ' : '📦 บันทึกรอบลงของ'}</h3>
              <button onClick={() => { setShowAddRound(false); setEditingRound(null) }} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">📦 วันที่ลงของ</label>
                <input type="date" value={roundForm.stock_date} onChange={e => setRoundForm({ ...roundForm, stock_date: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">🛵 วันที่ส่งของ</label>
                <input type="date" value={roundForm.delivery_date} onChange={e => setRoundForm({ ...roundForm, delivery_date: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">หมายเหตุ</label>
                <input value={roundForm.note} onChange={e => setRoundForm({ ...roundForm, note: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="เช่น รอบเช้า" />
              </div>
            </div>
            <button onClick={handleAddRound} disabled={saving}
              className="w-full bg-gradient-to-r from-blue-400 to-sky-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95 transition-transform">
              {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* ══ Settings Modal ══ */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">⚙️ ตั้งค่าแบ่งเงินเก็บ</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <p className="text-xs text-gray-400 mb-3">คำนวณจากกำไรสุทธิค่ะ รวมต้องได้ 100%</p>
            <div className="space-y-3">
              {financeSettings.map(s => (
                <div key={s.key} className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-sm">
                  <span className="flex-1 text-sm text-gray-700">{s.label}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" value={settingsForm[s.key] ?? s.value}
                      onChange={e => setSettingsForm({ ...settingsForm, [s.key]: Number(e.target.value) })}
                      className="w-16 text-center bg-gray-50 rounded-xl px-2 py-1.5 text-sm outline-none font-bold" min="0" max="100" />
                    <span className="text-gray-400 text-sm">%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className={`mt-3 text-center text-sm font-bold ${Object.values(settingsForm).reduce((s, v) => s + v, 0) === 100 ? 'text-teal-500' : 'text-amber-500'}`}>
              รวม {Object.values(settingsForm).reduce((s, v) => s + v, 0)}%
              {Object.values(settingsForm).reduce((s, v) => s + v, 0) === 100 ? ' ✅' : ' (ควรเป็น 100%)'}
            </div>
            <button onClick={handleSaveSettings} disabled={saving}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95 transition-transform">
              {saving ? 'กำลังบันทึก...' : '✅ บันทึกการตั้งค่า'}
            </button>
          </div>
        </div>
      )}

    </main>
  )
}