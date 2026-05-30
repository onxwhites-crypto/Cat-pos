'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type DebtCategory = {
  id: string
  name: string
  due_day: number | null
  billing_start_day: number | null
}

type Debt = {
  id: string
  name: string
  amount: number
  paid_amount: number
  category: string
  debt_category_id: string | null
  has_installments: boolean
  total_installments: number | null
  due_date: string | null
  note: string | null
  status: string
  debtor: string | null
  creditor: string | null
  receipt_id: string | null
  debt_installments: {
    id: string
    installment_no: number
    amount: number
    due_date: string | null
    paid: boolean
    paid_at: string | null
  }[]
}

// IDs ของ category พิเศษ
const SISTER_CATEGORY_ID = 'ff6cf3f5-db5b-48a4-adce-b1e5057d192b'
const WHITE_CATEGORY_ID = '61f0acb2-54c7-4dc6-9d0d-c06a50a2522b'

export default function DebtsPage() {
  const router = useRouter()
  const [debtCategories, setDebtCategories] = useState<DebtCategory[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    amount: '',
    debt_category_id: '',
    has_installments: false,
    total_installments: '5',
    installment_amount: '',
    last_installment_amount: '',
    start_date: new Date().toISOString().split('T')[0],
    note: '',
    due_date: '',
    paid_amount: '0',
  })

  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: cats }, { data: d }] = await Promise.all([
      supabase.from('debt_categories').select('*').order('name'),
      supabase.from('debts').select('*, debt_installments(*)').order('created_at', { ascending: false }),
    ])
    setDebtCategories(cats || [])
    setDebts(d || [])
    setLoading(false)
  }

  function getCurrentMonthInstallment(debt: Debt) {
    if (!debt.has_installments) return null
    return debt.debt_installments.find(i => {
      if (!i.due_date) return false
      const d = new Date(i.due_date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    }) || null
  }

  function getPaidAmount(debt: Debt) {
    if (debt.has_installments) {
      return debt.debt_installments.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
    }
    return debt.paid_amount
  }

  function getRemaining(debt: Debt) {
    return debt.amount - getPaidAmount(debt)
  }

  function getCategoryMonthlyAmount(categoryId: string) {
    return debts
      .filter(d => d.debt_category_id === categoryId)
      .reduce((sum, debt) => {
        const inst = getCurrentMonthInstallment(debt)
        if (inst) return sum + inst.amount
        if (!debt.has_installments) {
          const remaining = debt.amount - debt.paid_amount
          return sum + remaining
        }
        return sum
      }, 0)
  }

  function getCategoryStatus(categoryId: string) {
    const categoryDebts = debts.filter(d => d.debt_category_id === categoryId)
    if (categoryDebts.length === 0) return null
    const thisMonthInsts = categoryDebts
      .map(d => getCurrentMonthInstallment(d))
      .filter(Boolean)
    if (thisMonthInsts.length === 0) return 'no_installment'
    if (thisMonthInsts.every(i => i?.paid)) return 'paid'
    if (thisMonthInsts.some(i => i?.paid)) return 'partial'
    return 'unpaid'
  }

  function getMonthName(date: Date) {
    return date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
  }

  async function generateInstallments(debtId: string) {
    const startDate = new Date(form.start_date)
    const count = Number(form.total_installments)
    const amount = Number(form.installment_amount)
    const lastAmount = Number(form.last_installment_amount) || amount
    if (!count || !amount) return
    const installments = Array.from({ length: count }, (_, i) => {
      const dueDate = new Date(startDate)
      dueDate.setMonth(dueDate.getMonth() + i)
      return {
        debt_id: debtId,
        installment_no: i + 1,
        amount: i === count - 1 ? lastAmount : amount,
        due_date: dueDate.toISOString().split('T')[0],
        paid: false,
      }
    })
    await supabase.from('debt_installments').insert(installments)
  }

  async function handleSave() {
    if (!form.name || !form.amount) return
    setSaving(true)
    try {
      const { data: debt } = await supabase.from('debts').insert({
        name: form.name,
        amount: Number(form.amount),
        paid_amount: form.has_installments ? 0 : Number(form.paid_amount),
        debt_category_id: form.debt_category_id || null,
        category: debtCategories.find(c => c.id === form.debt_category_id)?.name || '',
        has_installments: form.has_installments,
        total_installments: form.has_installments ? Number(form.total_installments) : null,
        due_date: form.due_date || null,
        note: form.note || null,
        status: 'unpaid',
      }).select().single()

      if (debt && form.has_installments) {
        await generateInstallments(debt.id)
      }

      setShowAdd(false)
      setForm({
        name: '', amount: '', debt_category_id: '', has_installments: false,
        total_installments: '5', installment_amount: '', last_installment_amount: '',
        start_date: new Date().toISOString().split('T')[0],
        note: '', due_date: '', paid_amount: '0',
      })
      fetchData()
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setSaving(false)
  }

  // ─── แยก debts ตาม category ───
  const sisterDebts = debts.filter(d => d.debt_category_id === SISTER_CATEGORY_ID)
  const whiteDebts = debts.filter(d => d.debt_category_id === WHITE_CATEGORY_ID)

    const sisterTotal = sisterDebts.reduce((s, d) => s + d.amount, 0)
    const sisterPaid = sisterDebts.reduce((s, d) => s + getPaidAmount(d), 0)
    const sisterRemaining = sisterTotal - sisterPaid
    const sisterPendingCount = sisterDebts.filter(d => getRemaining(d) > 0).length

    const whiteTotal = whiteDebts.reduce((s, d) => s + d.amount, 0)
    const whitePaid = whiteDebts.reduce((s, d) => s + getPaidAmount(d), 0)
    const whiteRemaining = whiteTotal - whitePaid
    const whitePendingCount = whiteDebts.filter(d => getRemaining(d) > 0).length

  // category ปกติ (ไม่รวม พี่สาว / หนี้ไวท์)
  const specialCategoryIds = [SISTER_CATEGORY_ID, WHITE_CATEGORY_ID]
  const activeCategories = debtCategories.filter(cat =>
    !specialCategoryIds.includes(cat.id) &&
    debts.some(d => d.debt_category_id === cat.id)
  )

  // ยอดรวมหนี้ทั้งหมด
  const totalRemaining = debts.reduce((sum, d) => sum + getRemaining(d), 0)
  const totalAmount = debts.reduce((sum, d) => sum + d.amount, 0)
  const totalPaidAll = debts.reduce((sum, d) => sum + getPaidAmount(d), 0)

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
            <h1 className="text-xl font-bold text-gray-800">💳 หนี้สิน</h1>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="bg-red-500 text-white text-sm px-3 py-2 rounded-xl">
            + เพิ่มหนี้
          </button>
        </div>

        {/* Summary รวม */}
        {debts.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
            <div className="text-xs text-gray-500">หนี้คงเหลือทั้งหมด</div>
            <div className="text-3xl font-bold text-red-500 mb-3">
              {totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
              <div>
                <div className="text-xs text-gray-500">หนี้ทั้งหมด</div>
                <div className="font-bold text-gray-800">
                  {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">ชำระแล้ว</div>
                <div className="font-bold text-green-500">
                  {totalPaidAll.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
        ) : (
          <div className="space-y-3">

            {/* ─── Section พิเศษ: พี่สาวเป็นหนี้เรา ─── */}
            {sisterDebts.length > 0 && (
              <button
                onClick={() => router.push(`/debts/${SISTER_CATEGORY_ID}`)}
                className="w-full bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform border border-purple-100">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-purple-800 text-base">💜 พี่สาวเป็นหนี้เรา</div>
                    <div className="text-xs text-purple-500 mt-0.5">ค้าง {sisterPendingCount} ออเดอร์</div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${sisterRemaining <= 0 ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'}`}>
                    {sisterRemaining <= 0 ? '✅ หมดแล้ว' : '⏳ ค้างอยู่'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/70 rounded-xl p-2.5">
                    <div className="text-xs text-gray-500">ค้างอยู่</div>
                    <div className="font-bold text-purple-600 text-lg">
                      {sisterRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
                    </div>
                  </div>
                  <div className="bg-white/70 rounded-xl p-2.5">
                    <div className="text-xs text-gray-500">จ่ายแล้ว</div>
                    <div className="font-bold text-green-500 text-lg">
                      {sisterPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* ─── Section พิเศษ: เราเป็นหนี้ไวท์ ─── */}
            {whiteDebts.length > 0 && (
              <button
                onClick={() => router.push(`/debts/${WHITE_CATEGORY_ID}`)}
                className="w-full bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform border border-sky-100">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-bold text-sky-800 text-base">💙 เราเป็นหนี้ไวท์</div>
                    <div className="text-xs text-sky-500 mt-0.5">ค้าง {whitePendingCount} รายการ</div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${whiteRemaining <= 0 ? 'bg-green-100 text-green-600' : 'bg-sky-100 text-sky-600'}`}>
                    {whiteRemaining <= 0 ? '✅ คืนหมดแล้ว' : '⏳ ค้างอยู่'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/70 rounded-xl p-2.5">
                    <div className="text-xs text-gray-500">ค้างอยู่</div>
                    <div className="font-bold text-sky-600 text-lg">
                      {whiteRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
                    </div>
                  </div>
                  <div className="bg-white/70 rounded-xl p-2.5">
                    <div className="text-xs text-gray-500">จ่ายแล้ว</div>
                    <div className="font-bold text-green-500 text-lg">
                      {whitePaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* ─── Divider ─── */}
            {(sisterDebts.length > 0 || whiteDebts.length > 0) && activeCategories.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">หนี้ส่วนตัว</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            )}

            {/* ─── Category ปกติ ─── */}
            {activeCategories.map(cat => {
              const status = getCategoryStatus(cat.id)
              const monthlyAmount = getCategoryMonthlyAmount(cat.id)
              const catDebts = debts.filter(d => d.debt_category_id === cat.id)
              return (
                <button key={cat.id}
                  onClick={() => router.push(`/debts/${cat.id}`)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform">
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-gray-800">💳 {cat.name}</div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      status === 'paid' ? 'bg-green-100 text-green-600' :
                      status === 'partial' ? 'bg-yellow-100 text-yellow-600' :
                      status === 'unpaid' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {status === 'paid' ? '✅ ชำระแล้ว' :
                       status === 'partial' ? '🟡 ชำระบางส่วน' :
                       status === 'unpaid' ? '⏳ ยังไม่ชำระ' : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      รอบบิล {getMonthName(today)}
                      {cat.due_day ? ` · ทุกวันที่ ${cat.due_day}` : ''}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-red-500">
                        {monthlyAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
                      </span>
                      <span className="text-gray-400">›</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{catDebts.length} รายการ</div>
                </button>
              )
            })}

            {/* ─── ถ้ายังไม่มีหนี้เลย ─── */}
            {debts.length === 0 && (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">💳</div>
                <p>ยังไม่มีหนี้สินค่ะ</p>
              </div>
            )}

          </div>
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">เพิ่มหนี้</h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">หมวดหมู่ *</label>
                  <select value={form.debt_category_id}
                    onChange={e => setForm({...form, debt_category_id: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                    <option value="">เลือกหมวดหมู่</option>
                    {debtCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">ชื่อรายการ *</label>
                  <input value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="เช่น ตุ๊กตา, ทิชชู่" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">ยอดรวม (฿) *</label>
                  <input type="number" step="0.01" value={form.amount}
                    onChange={e => setForm({...form, amount: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="0" />
                </div>
                <div className="bg-purple-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-purple-700">📅 แบ่งจ่ายเป็นงวด</div>
                    <div className="text-xs text-purple-500">เปิดสำหรับผ่อนหลายเดือน</div>
                  </div>
                  <button onClick={() => setForm({...form, has_installments: !form.has_installments})}
                    className={`relative w-12 h-7 rounded-full transition-colors ${form.has_installments ? 'bg-purple-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-transform ${form.has_installments ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {form.has_installments ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">จำนวนงวด</label>
                        <input type="number" value={form.total_installments}
                          onChange={e => setForm({...form, total_installments: e.target.value})}
                          className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" min="1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">ยอดงวดปกติ (฿)</label>
                        <input type="number" step="0.01" value={form.installment_amount}
                          onChange={e => setForm({...form, installment_amount: e.target.value})}
                          className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                          placeholder="เช่น 128.10" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">ยอดงวดสุดท้าย (฿)</label>
                      <input type="number" step="0.01" value={form.last_installment_amount}
                        onChange={e => setForm({...form, last_installment_amount: e.target.value})}
                        className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                        placeholder="ถ้าเท่ากันเว้นว่างไว้ค่ะ" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">วันที่เริ่มงวดแรก</label>
                      <input type="date" value={form.start_date}
                        onChange={e => setForm({...form, start_date: e.target.value})}
                        className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs text-gray-500">วันครบกำหนด</label>
                    <input type="date" value={form.due_date}
                      onChange={e => setForm({...form, due_date: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500">หมายเหตุ</label>
                  <textarea value={form.note}
                    onChange={e => setForm({...form, note: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    rows={2} placeholder="รายละเอียดเพิ่มเติม" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving || !form.name || !form.amount}
                className="w-full bg-red-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}