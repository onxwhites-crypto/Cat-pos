'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type OrderItem = {
  quantity: number
  products: { avg_cost: number | null } | null
}

type Order = {
  id: string
  order_date: string
  total: number
  payment_method: string
  payment_status: string
  order_items: OrderItem[]
}

type Expense = {
  id: string
  category: string
  amount: number
  note: string
  date: string
}

const EXPENSE_CATEGORIES = [
  'ค่าเดินทาง',
  'ค่าน้ำมัน',
  'ค่าถุง/บรรจุภัณฑ์',
  'ค่าโทรศัพท์',
  'ค่าโฆษณา',
  'ค่าน้ำ-ไฟ',
  'อื่นๆ',
]

export default function FinancePage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('today')
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    category: 'ค่าเดินทาง',
    amount: '',
    note: '',
    date: new Date().toISOString().split('T')[0],
  })

  useEffect(() => { fetchData() }, [period])

  function getDateRange() {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    let from: Date

    switch (period) {
      case 'today': from = today; break
      case 'week':
        from = new Date(today)
        from.setDate(today.getDate() - 7)
        break
      case 'month': from = new Date(today.getFullYear(), today.getMonth(), 1); break
      case 'year': from = new Date(today.getFullYear(), 0, 1); break
      default: from = new Date(2020, 0, 1)
    }
    return from.toISOString().split('T')[0]
  }

  async function fetchData() {
    const fromDate = getDateRange()

    const [{ data: o }, { data: e }] = await Promise.all([
      supabase.from('orders')
        .select('id, order_date, total, payment_method, payment_status, order_items(quantity, products(avg_cost))')
        .gte('order_date', fromDate)
        .eq('payment_status', 'paid')
        .order('order_date', { ascending: false }),
      supabase.from('expenses')
        .select('*')
        .gte('date', fromDate)
        .order('date', { ascending: false }),
    ])

    setOrders((o || []) as Order[])
    setExpenses(e || [])
  }

  async function handleAddExpense() {
    if (!form.amount || Number(form.amount) <= 0) return
    setSaving(true)
    await supabase.from('expenses').insert({
      category: form.category,
      amount: Number(form.amount),
      note: form.note || null,
      date: form.date,
    })
    setForm({ category: 'ค่าเดินทาง', amount: '', note: '', date: new Date().toISOString().split('T')[0] })
    setShowAddExpense(false)
    fetchData()
    setSaving(false)
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await supabase.from('expenses').delete().eq('id', id)
    fetchData()
  }

  const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0)
  const totalCost = orders.reduce((sum, o) =>
    sum + o.order_items.reduce((s, i) => s + ((i.products?.avg_cost || 0) * i.quantity), 0), 0)
  const grossProfit = totalSales - totalCost
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const netProfit = grossProfit - totalExpenses

  const cashSales = orders.filter(o => o.payment_method === 'cash').reduce((sum, o) => sum + o.total, 0)
  const transferSales = orders.filter(o => o.payment_method === 'transfer').reduce((sum, o) => sum + o.total, 0)

  const expensesByCategory: { [k: string]: number } = {}
  expenses.forEach(e => {
    expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount
  })

  const periodLabels: { [k: string]: string } = {
    today: 'วันนี้', week: '7 วันล่าสุด', month: 'เดือนนี้', year: 'ปีนี้', all: 'ทั้งหมด',
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
            <h1 className="text-xl font-bold text-gray-800">💰 การเงิน</h1>
          </div>
          <button onClick={() => setShowAddExpense(true)}
            className="bg-yellow-500 text-white text-sm px-3 py-2 rounded-xl">
            + รายจ่าย
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {(['today', 'week', 'month', 'year', 'all'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
                period === p ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'
              }`}>
              {periodLabels[p]}
            </button>
          ))}
        </div>

        <div className={`rounded-2xl p-4 shadow-sm mb-3 ${netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="text-xs text-gray-500">กำไรสุทธิ ({periodLabels[period]})</div>
          <div className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}฿
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {orders.length} ออเดอร์ · กำไรขั้นต้น {grossProfit.toFixed(2)}฿
          </div>
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
              <span className="text-gray-700">กำไรขั้นต้น</span>
              <span className="text-green-600">{grossProfit.toFixed(2)}฿</span>
            </div>
          </div>

          {(cashSales > 0 || transferSales > 0) && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-500 mb-2">แยกตามวิธีชำระ</div>
              <div className="flex justify-between text-sm">
                <span>💵 เงินสด</span>
                <span className="font-medium">{cashSales.toLocaleString()}฿</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>💳 โอน</span>
                <span className="font-medium">{transferSales.toLocaleString()}฿</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <h3 className="font-bold text-gray-700 mb-3">💸 รายจ่าย</h3>
          {Object.keys(expensesByCategory).length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">ไม่มีรายจ่ายในช่วงนี้</p>
          ) : (
            <div className="space-y-2 mb-3">
              {Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                <div key={cat} className="flex justify-between text-sm">
                  <span className="text-gray-500">{cat}</span>
                  <span className="font-medium">{amt.toLocaleString()}฿</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between font-bold pt-2 border-t border-gray-100">
            <span className="text-gray-700">รวมรายจ่าย</span>
            <span className="text-red-500">-{totalExpenses.toLocaleString()}฿</span>
          </div>
        </div>

        {expenses.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
            <h3 className="font-bold text-gray-700 mb-3">รายการรายจ่าย</h3>
            <div className="space-y-2">
              {expenses.map(e => (
                <div key={e.id} className="flex justify-between items-start py-2 border-b border-gray-100 last:border-0">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{e.category}</div>
                    {e.note && <div className="text-xs text-gray-400 mt-0.5">{e.note}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(e.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="font-bold text-red-500">-{e.amount.toLocaleString()}฿</span>
                    <button onClick={() => handleDeleteExpense(e.id)} className="text-red-400 text-sm">🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                  <input type="number" value={form.amount}
                    onChange={e => setForm({...form, amount: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="0" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-gray-500">วันที่</label>
                  <input type="date" value={form.date}
                    onChange={e => setForm({...form, date: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">หมายเหตุ</label>
                  <input value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="รายละเอียดเพิ่มเติม" />
                </div>
              </div>
              <button onClick={handleAddExpense} disabled={saving || !form.amount}
                className="w-full bg-yellow-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ เพิ่มรายจ่าย'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}