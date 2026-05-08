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
  payment_method: string
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
}

type DeliveryRound = {
  id: string
  stock_date: string
  delivery_date: string
  note: string | null
}

const EXPENSE_CATEGORIES = [
  'ค่าเดินทาง', 'ค่าน้ำมัน', 'ค่าถุง/บรรจุภัณฑ์',
  'ค่าโทรศัพท์', 'ค่าโฆษณา', 'ค่าน้ำ-ไฟ', 'อื่นๆ',
]

export default function FinancePage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [deliveryRounds, setDeliveryRounds] = useState<DeliveryRound[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showAddRound, setShowAddRound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'calendar' | 'summary'>('calendar')

  const [form, setForm] = useState({
    category: 'ค่าเดินทาง', amount: '', note: '',
    date: new Date().toISOString().split('T')[0],
  })
  const [roundForm, setRoundForm] = useState({
    stock_date: new Date().toISOString().split('T')[0],
    delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    note: '',
  })
  const [editingRound, setEditingRound] = useState<DeliveryRound | null>(null)

  useEffect(() => { fetchData() }, [currentMonth])

  async function fetchData() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const fromDate = new Date(year, month, 1).toISOString().split('T')[0]
    const toDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

    const [{ data: o }, { data: e }, { data: r }] = await Promise.all([
      supabase.from('orders')
        .select('id, order_date, created_at, total, payment_method, payment_status, customers(name), order_items(quantity, unit_price, products(avg_cost, name))')
        .gte('order_date', fromDate)
        .lte('order_date', toDate)
        .eq('payment_status', 'paid')
        .order('order_date', { ascending: false }),
      supabase.from('expenses')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: false }),
      supabase.from('delivery_rounds')
        .select('*')
        .order('stock_date', { ascending: false }),
    ])

    setOrders((o || []) as any)
    setExpenses(e || [])
    setDeliveryRounds(r || [])
  }

  function getDaysInMonth() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return { firstDay, daysInMonth }
  }

function getDateStr(day: number) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}
  function getOrdersForDate(dateStr: string) {
    return orders.filter(o => o.order_date === dateStr || o.created_at?.startsWith(dateStr))
  }

  function getExpensesForDate(dateStr: string) {
    return expenses.filter(e => e.date === dateStr)
  }

  function getDayCost(dateStr: string) {
    return getOrdersForDate(dateStr).reduce((sum, o) =>
      sum + o.order_items.reduce((s, i) => s + ((i.products?.avg_cost || 0) * i.quantity), 0), 0)
  }

  function getDayProfit(dateStr: string) {
    const dayOrders = getOrdersForDate(dateStr)
    const sales = dayOrders.reduce((sum, o) => sum + o.total, 0)
    const cost = getDayCost(dateStr)
    return sales - cost
  }

  function isStockDate(dateStr: string) {
    return deliveryRounds.some(r => r.stock_date === dateStr)
  }

  function isDeliveryDate(dateStr: string) {
    return deliveryRounds.some(r => r.delivery_date === dateStr)
  }

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))

  // Summary
  const totalSales = orders.reduce((sum, o) => sum + o.total, 0)
  const totalCost = orders.reduce((sum, o) =>
    sum + o.order_items.reduce((s, i) => s + ((i.products?.avg_cost || 0) * i.quantity), 0), 0)
  const grossProfit = totalSales - totalCost
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const netProfit = grossProfit - totalExpenses

  // Selected date data
  const selectedOrders = selectedDate ? getOrdersForDate(selectedDate) : []
  const selectedExpenses = selectedDate ? getExpensesForDate(selectedDate) : []
  const selectedSales = selectedOrders.reduce((sum, o) => sum + o.total, 0)
  const selectedCost = selectedOrders.reduce((sum, o) =>
    sum + o.order_items.reduce((s, i) => s + ((i.products?.avg_cost || 0) * i.quantity), 0), 0)
  const selectedProfit = selectedSales - selectedCost

  async function handleAddExpense() {
    if (!form.amount || Number(form.amount) <= 0) return
    setSaving(true)
    await supabase.from('expenses').insert({
      category: form.category, amount: Number(form.amount),
      note: form.note || null, date: form.date,
    })
    setForm({ category: 'ค่าเดินทาง', amount: '', note: '', date: new Date().toISOString().split('T')[0] })
    setShowAddExpense(false)
    fetchData()
    setSaving(false)
  }

  async function handleAddRound() {
    if (!roundForm.stock_date || !roundForm.delivery_date) return
    setSaving(true)
    if (editingRound) {
      await supabase.from('delivery_rounds').update({
        stock_date: roundForm.stock_date,
        delivery_date: roundForm.delivery_date,
        note: roundForm.note || null,
      }).eq('id', editingRound.id)
    } else {
      await supabase.from('delivery_rounds').insert({
        stock_date: roundForm.stock_date,
        delivery_date: roundForm.delivery_date,
        note: roundForm.note || null,
      })
    }
    setShowAddRound(false)
    setEditingRound(null)
    setRoundForm({ stock_date: new Date().toISOString().split('T')[0], delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], note: '' })
    fetchData()
    setSaving(false)
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await supabase.from('expenses').delete().eq('id', id)
    fetchData()
  }

  const { firstDay, daysInMonth } = getDaysInMonth()
  const monthName = currentMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
            <h1 className="text-xl font-bold text-gray-800">💰 การเงิน</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setEditingRound(null); setRoundForm({ stock_date: new Date().toISOString().split('T')[0], delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0], note: '' }); setShowAddRound(true) }}
              className="bg-blue-500 text-white text-sm px-3 py-2 rounded-xl">
              📦 ลงของ
            </button>
            <button onClick={() => setShowAddExpense(true)}
              className="bg-yellow-500 text-white text-sm px-3 py-2 rounded-xl">
              + รายจ่าย
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => setActiveTab('calendar')}
            className={`py-2 rounded-xl text-sm font-bold ${activeTab === 'calendar' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'}`}>
            📅 ปฏิทิน
          </button>
          <button onClick={() => setActiveTab('summary')}
            className={`py-2 rounded-xl text-sm font-bold ${activeTab === 'summary' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'}`}>
            📊 สรุป
          </button>
        </div>

        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <>
            {/* Month Navigator */}
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth} className="text-gray-500 text-xl px-2">‹</button>
                <h2 className="font-bold text-gray-800">{monthName}</h2>
                <button onClick={nextMonth} className="text-gray-500 text-xl px-2">›</button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => (
                  <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const dateStr = getDateStr(day)
                  const dayOrders = getOrdersForDate(dateStr)
                  const dayCost = getDayCost(dateStr)
                  const dayProfit = getDayProfit(dateStr)
                  const hasOrders = dayOrders.length > 0
                  const isStock = isStockDate(dateStr)
                  const isDelivery = isDeliveryDate(dateStr)
                  const isSelected = selectedDate === dateStr
                  const isToday = dateStr === new Date().toISOString().split('T')[0]

                  return (
                    <button key={day} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`rounded-xl p-1 min-h-[52px] text-left transition-all ${
                        isSelected ? 'bg-yellow-100 ring-2 ring-yellow-400' :
                        isToday ? 'bg-orange-50 ring-1 ring-orange-300' :
                        hasOrders ? 'bg-green-50' : 'bg-gray-50'
                      }`}>

            <div className="flex justify-between items-center px-0.5">
              <div className="text-xs leading-none min-w-[14px]">
                {isStock && <span>📦</span>}
                {isDelivery && <span>🛵</span>}
              </div>
              <div className={`text-xs font-bold ${isToday ? 'text-orange-500' : 'text-gray-700'}`}>
                {day}
              </div>
            </div>

              {hasOrders && (
                <>
                  <div className="text-center text-xs text-red-500 font-medium leading-tight mt-0.5">
                    {dayCost > 0 ? `${dayCost.toFixed(0)}` : ''}
                  </div>
                  <div className={`text-center text-xs font-medium leading-tight ${dayProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {dayProfit.toFixed(0)}
                  </div>
                </>
              )}

                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-3 mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
                <span>📦 ลงของ</span>
                <span>🛵 ส่งของ</span>
                <span className="text-red-500">ทุน</span>
                <span className="text-green-600">กำไร</span>
              </div>
            </div>

            {/* Selected Date Detail */}
            {selectedDate && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
                <h3 className="font-bold text-gray-700 mb-3">
                  📅 {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: '2-digit' })}
                  {isStockDate(selectedDate) && <span className="ml-2 text-sm">📦 วันลงของ</span>}
                  {isDeliveryDate(selectedDate) && <span className="ml-2 text-sm">🛵 วันส่งของ</span>}
                </h3>

                {selectedOrders.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">ไม่มีออเดอร์วันนี้ค่ะ</p>
                ) : (
                  <>
                    {/* Summary bar */}
                    <div className="bg-gray-50 rounded-xl p-3 mb-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xs text-gray-400">ยอดขาย</div>
                        <div className="font-bold text-green-600 text-sm">{selectedSales.toLocaleString()}฿</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">ต้นทุน</div>
                        <div className="font-bold text-gray-600 text-sm">{selectedCost.toFixed(0)}฿</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">กำไร</div>
                        <div className={`font-bold text-sm ${selectedProfit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{selectedProfit.toFixed(0)}฿</div>
                      </div>
                    </div>

                    {/* Orders */}
                    <div className="space-y-2">
                    {selectedOrders.map(o => {
                      const orderCost = o.order_items.reduce((s, i) => s + ((i.products?.avg_cost || 0) * i.quantity), 0)
                      const orderProfit = o.total - orderCost
                      return (
                        <div key={o.id} className="bg-gray-50 rounded-xl p-3">
                          {/* หัว: ชื่อลูกค้า + ยอดรวม */}
                          <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
                            <div className="font-bold text-sm text-gray-800">{o.customers?.name || 'ลูกค้าทั่วไป'}</div>
                            <div className="font-bold text-orange-500">{o.total.toLocaleString()}฿</div>
                          </div>
                          {/* รายการสินค้า */}
                          <div className="space-y-1.5">
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
                                    <span className={itemProfit >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                                      กำไร {itemProfit.toFixed(0)}฿
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          {/* รวมบิล */}
                          <div className="flex gap-4 text-xs mt-2 pt-2 border-t border-gray-200">
                            <span className="text-red-500 font-medium">รวมทุน {orderCost.toFixed(0)}฿</span>
                            <span className={`font-medium ${orderProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              รวมกำไร {orderProfit.toFixed(0)}฿
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </>
                )}


                {selectedExpenses.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500 font-bold mb-2">💸 รายจ่าย</div>
                    {selectedExpenses.map(e => (
                      <div key={e.id} className="flex justify-between text-sm py-1">
                        <span className="text-gray-600">{e.category} {e.note ? `(${e.note})` : ''}</span>
                        <span className="text-red-500 font-medium">-{e.amount.toLocaleString()}฿</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Delivery Rounds this month */}
            {deliveryRounds.filter(r => r.stock_date.startsWith(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`)).length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
                <h3 className="font-bold text-gray-700 mb-2">📦 รอบลงของเดือนนี้</h3>
                <div className="space-y-2">
                  {deliveryRounds
                    .filter(r => r.stock_date.startsWith(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`))
                    .map(r => (
                      <div key={r.id} className="flex justify-between items-center bg-gray-50 rounded-xl px-3 py-2">
                        <div>
                          <div className="text-sm">
                            📦 {new Date(r.stock_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                            {' → '}
                            🛵 {new Date(r.delivery_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                          </div>
                          {r.note && <div className="text-xs text-gray-400 mt-0.5">{r.note}</div>}
                        </div>
                        <button onClick={() => {
                          setEditingRound(r)
                          setRoundForm({ stock_date: r.stock_date, delivery_date: r.delivery_date, note: r.note || '' })
                          setShowAddRound(true)
                        }} className="text-blue-500 text-xs bg-blue-50 px-2 py-1 rounded-lg">✏️</button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <>
            <div className={`rounded-2xl p-4 shadow-sm mb-3 ${netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-xs text-gray-500">กำไรสุทธิ {monthName}</div>
              <div className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
              </div>
              <div className="text-xs text-gray-400 mt-1">{orders.length} ออเดอร์ · กำไรขั้นต้น {grossProfit.toFixed(2)}฿</div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
              <h3 className="font-bold text-gray-700 mb-3">💵 รายรับ</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ยอดขายรวม</span>
                  <span className="font-bold text-green-600">{totalSales.toLocaleString()}฿</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ต้นทุนสินค้า</span>
                  <span className="text-gray-700">-{totalCost.toFixed(2)}฿</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t border-gray-100">
                  <span>กำไรขั้นต้น</span>
                  <span className="text-green-600">{grossProfit.toFixed(2)}฿</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
              <h3 className="font-bold text-gray-700 mb-3">💸 รายจ่าย</h3>
              {expenses.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">ไม่มีรายจ่ายค่ะ</p>
              ) : (
                <div className="space-y-2">
                  {expenses.map(e => (
                    <div key={e.id} className="flex justify-between items-start py-1.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{e.category}</div>
                        {e.note && <div className="text-xs text-gray-400">{e.note}</div>}
                        <div className="text-xs text-gray-400">{new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-red-500">-{e.amount.toLocaleString()}฿</span>
                        <button onClick={() => handleDeleteExpense(e.id)} className="text-red-400">🗑️</button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold pt-2 border-t border-gray-100">
                    <span>รวมรายจ่าย</span>
                    <span className="text-red-500">-{totalExpenses.toLocaleString()}฿</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Add Expense Modal */}
        {showAddExpense && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">เพิ่มรายจ่าย</h3>
                <button onClick={() => setShowAddExpense(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">หมวดหมู่</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                    {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">จำนวนเงิน (฿) *</label>
                  <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="0" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-gray-500">วันที่</label>
                  <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">หมายเหตุ</label>
                  <input value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="รายละเอียด" />
                </div>
              </div>
              <button onClick={handleAddExpense} disabled={saving || !form.amount}
                className="w-full bg-yellow-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ เพิ่มรายจ่าย'}
              </button>
            </div>
          </div>
        )}

        {/* Add/Edit Round Modal */}
        {showAddRound && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">{editingRound ? '✏️ แก้ไขรอบลงของ' : '📦 บันทึกรอบลงของ'}</h3>
                <button onClick={() => { setShowAddRound(false); setEditingRound(null) }} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">📦 วันที่ลงของ</label>
                  <input type="date" value={roundForm.stock_date}
                    onChange={e => setRoundForm({...roundForm, stock_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">🛵 วันที่ส่งของ</label>
                  <input type="date" value={roundForm.delivery_date}
                    onChange={e => setRoundForm({...roundForm, delivery_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">หมายเหตุ</label>
                  <input value={roundForm.note} onChange={e => setRoundForm({...roundForm, note: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="เช่น รอบเช้า" />
                </div>
              </div>
              <button onClick={handleAddRound} disabled={saving}
                className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}