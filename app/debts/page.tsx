'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Installment = {
  id: string
  debt_id: string
  installment_no: number
  amount: number
  due_date: string | null
  paid: boolean
  paid_at: string | null
  note: string
}

type Debt = {
  id: string
  name: string
  amount: number
  paid_amount: number
  due_date: string | null
  category: string
  status: string
  note: string
  has_installments: boolean
  total_installments: number | null
  created_at: string
  debt_installments: Installment[]
}

const DEBT_CATEGORIES = [
  'ค่าสินค้า',
  'SPaylater',
  'ผ่อนสินค้า',
  'ค่าเช่า',
  'ค่าโทรศัพท์',
  'ค่าน้ำ-ไฟ',
  'เงินกู้',
  'อื่นๆ',
]

export default function DebtsPage() {
  const router = useRouter()
  const [debts, setDebts] = useState<Debt[]>([])
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('unpaid')
  const [showAdd, setShowAdd] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [showDetail, setShowDetail] = useState<Debt | null>(null)
  const [saving, setSaving] = useState(false)

  // Form
  const [form, setForm] = useState({
    name: '',
    amount: '',
    paid_amount: '0',
    due_date: '',
    category: 'ค่าสินค้า',
    note: '',
    has_installments: false,
    total_installments: '5',
    installments: [] as { amount: string; due_date: string }[],
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const { data } = await supabase
      .from('debts')
      .select('*, debt_installments(*)')
      .order('created_at', { ascending: false })
    setDebts(data || [])
  }

  function calcStatus(d: Debt): 'paid' | 'partial' | 'unpaid' {
    const paid = d.has_installments
      ? d.debt_installments.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
      : d.paid_amount
    if (paid >= d.amount) return 'paid'
    if (paid > 0) return 'partial'
    return 'unpaid'
  }

  function getPaidAmount(d: Debt): number {
    if (d.has_installments) {
      return d.debt_installments.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
    }
    return d.paid_amount
  }

  const filteredDebts = debts.filter(d => {
    if (filter === 'all') return true
    return calcStatus(d) === filter
  })

  function openAdd() {
    setForm({
      name: '', amount: '', paid_amount: '0', due_date: '',
      category: 'ค่าสินค้า', note: '',
      has_installments: false, total_installments: '5', installments: [],
    })
    setEditingDebt(null)
    setShowAdd(true)
  }

  function generateInstallments() {
    const total = Number(form.amount)
    const count = Number(form.total_installments)
    if (!total || !count || count <= 0) return

    const perInstallment = Math.floor((total / count) * 100) / 100
    const lastInstallment = total - (perInstallment * (count - 1))

    const newInstallments = Array.from({ length: count }, (_, i) => ({
      amount: (i === count - 1 ? lastInstallment : perInstallment).toFixed(2),
      due_date: '',
    }))
    setForm({ ...form, installments: newInstallments })
  }

  function updateInstallment(index: number, field: 'amount' | 'due_date', value: string) {
    const updated = [...form.installments]
    updated[index] = { ...updated[index], [field]: value }
    setForm({ ...form, installments: updated })
  }

  async function handleSave() {
    if (!form.name || !form.amount) return
    setSaving(true)
    try {
      const status = form.has_installments ? 'unpaid' : (
        Number(form.paid_amount) >= Number(form.amount) ? 'paid' :
        Number(form.paid_amount) > 0 ? 'partial' : 'unpaid'
      )

      const debtData = {
        name: form.name,
        amount: Number(form.amount),
        paid_amount: form.has_installments ? 0 : Number(form.paid_amount),
        due_date: form.due_date || null,
        category: form.category,
        note: form.note || null,
        status,
        has_installments: form.has_installments,
        total_installments: form.has_installments ? Number(form.total_installments) : null,
      }

      let debtId: string
      if (editingDebt) {
        await supabase.from('debts').update(debtData).eq('id', editingDebt.id)
        debtId = editingDebt.id
        // ลบงวดเก่า ถ้าเป็นแบบงวด
        if (form.has_installments) {
          await supabase.from('debt_installments').delete().eq('debt_id', debtId)
        }
      } else {
        const { data } = await supabase.from('debts').insert(debtData).select().single()
        debtId = data!.id
      }

      // เพิ่มงวด
      if (form.has_installments && form.installments.length > 0) {
        await supabase.from('debt_installments').insert(
          form.installments.map((inst, i) => ({
            debt_id: debtId,
            installment_no: i + 1,
            amount: Number(inst.amount),
            due_date: inst.due_date || null,
            paid: false,
          }))
        )
      }

      setShowAdd(false)
      fetchData()
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setSaving(false)
  }

  async function toggleInstallmentPaid(inst: Installment) {
    const newPaid = !inst.paid
    await supabase.from('debt_installments').update({
      paid: newPaid,
      paid_at: newPaid ? new Date().toISOString() : null,
    }).eq('id', inst.id)

    // อัพเดท status ของ debt
    const debt = debts.find(d => d.id === inst.debt_id)
    if (debt) {
      const updatedInstallments = debt.debt_installments.map(i =>
        i.id === inst.id ? { ...i, paid: newPaid } : i
      )
      const totalPaid = updatedInstallments.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
      const newStatus = totalPaid >= debt.amount ? 'paid' :
                        totalPaid > 0 ? 'partial' : 'unpaid'
      await supabase.from('debts').update({ status: newStatus }).eq('id', debt.id)
    }

    fetchData()
    if (showDetail) {
      const updated = debts.find(d => d.id === showDetail.id)
      if (updated) setShowDetail(updated)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ลบหนี้ "${name}"? (รวมถึงงวดผ่อนทั้งหมด)`)) return
    await supabase.from('debts').delete().eq('id', id)
    fetchData()
  }

  // Summary
  const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0)
  const totalPaid = debts.reduce((sum, d) => sum + getPaidAmount(d), 0)
  const totalRemaining = totalDebt - totalPaid

  // Overdue installments
  const today = new Date().toISOString().split('T')[0]
  const overdueInstallments = debts.flatMap(d =>
    d.debt_installments.filter(i =>
      !i.paid && i.due_date && i.due_date < today
    )
  )

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
            <h1 className="text-xl font-bold text-gray-800">💳 หนี้สิน</h1>
          </div>
          <button onClick={openAdd}
            className="bg-red-500 text-white text-sm px-3 py-2 rounded-xl">
            + เพิ่มหนี้
          </button>
        </div>

        {/* Overdue Warning */}
        {overdueInstallments.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-3">
            <div className="text-sm font-bold text-red-600">⚠️ มีงวดเกินกำหนด</div>
            <div className="text-xs text-red-500 mt-1">
              มี {overdueInstallments.length} งวดที่เลยกำหนดชำระแล้วค่ะ
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <div className="text-xs text-gray-500">หนี้คงเหลือ</div>
          <div className="text-3xl font-bold text-red-500">
            {totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}฿
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
            <div>
              <div className="text-xs text-gray-500">หนี้ทั้งหมด</div>
              <div className="font-bold text-gray-800">{totalDebt.toLocaleString()}฿</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">จ่ายแล้ว</div>
              <div className="font-bold text-green-500">{totalPaid.toLocaleString()}฿</div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <button onClick={() => setFilter('unpaid')}
            className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${
              filter === 'unpaid' ? 'bg-red-500 text-white' : 'bg-white text-gray-600'
            }`}>
            🔴 ยังไม่จ่าย
          </button>
          <button onClick={() => setFilter('partial')}
            className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${
              filter === 'partial' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600'
            }`}>
            🟡 ผ่อนอยู่
          </button>
          <button onClick={() => setFilter('paid')}
            className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${
              filter === 'paid' ? 'bg-green-500 text-white' : 'bg-white text-gray-600'
            }`}>
            ✅ ปิดยอด
          </button>
          <button onClick={() => setFilter('all')}
            className={`flex-1 min-w-fit py-2 px-3 rounded-xl text-xs font-medium whitespace-nowrap ${
              filter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'
            }`}>
            ทั้งหมด
          </button>
        </div>

        {/* Debt List */}
        {filteredDebts.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">💳</div>
            <p>ไม่มีรายการค่ะ</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDebts.map(d => {
              const status = calcStatus(d)
              const paidAmt = getPaidAmount(d)
              const remaining = d.amount - paidAmt
              const paidInstallments = d.debt_installments.filter(i => i.paid).length
              const totalInst = d.debt_installments.length
              const hasOverdue = d.debt_installments.some(i =>
                !i.paid && i.due_date && i.due_date < today
              )

              return (
                <button key={d.id} onClick={() => setShowDetail(d)}
                  className={`w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform ${
                    hasOverdue ? 'border-2 border-red-200' : ''
                  }`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">{d.name}</div>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {d.category}
                        </span>
                        {d.has_installments && (
                          <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                            📅 ผ่อน {paidInstallments}/{totalInst} งวด
                          </span>
                        )}
                        {hasOverdue && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                            ⚠️ เกินกำหนด
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ml-2 ${
                      status === 'paid' ? 'bg-green-100 text-green-600' :
                      status === 'partial' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {status === 'paid' ? '✅' : status === 'partial' ? '🟡' : '🔴'}
                    </span>
                  </div>

                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">
                        {paidAmt.toFixed(2)} / {d.amount.toLocaleString()}฿
                      </span>
                      <span className="font-bold text-red-500">
                        เหลือ {remaining.toFixed(2)}฿
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        status === 'paid' ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                        style={{ width: `${Math.min(100, (paidAmt / d.amount) * 100)}%` }} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Detail Modal */}
        {showDetail && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">{showDetail.name}</h3>
                <button onClick={() => setShowDetail(null)} className="text-gray-400 text-xl">✕</button>
              </div>

              {/* Info */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ยอดทั้งหมด</span>
                  <span className="font-bold">{showDetail.amount.toLocaleString()}฿</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">จ่ายแล้ว</span>
                  <span className="font-bold text-green-500">{getPaidAmount(showDetail).toFixed(2)}฿</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200 mt-2">
                  <span>คงเหลือ</span>
                  <span className="text-red-500">{(showDetail.amount - getPaidAmount(showDetail)).toFixed(2)}฿</span>
                </div>
              </div>

              {/* Installments */}
              {showDetail.has_installments && showDetail.debt_installments.length > 0 && (
                <div className="mb-3">
                  <h4 className="font-bold text-sm text-gray-700 mb-2">งวดผ่อน</h4>
                  <div className="space-y-2">
                    {[...showDetail.debt_installments]
                      .sort((a, b) => a.installment_no - b.installment_no)
                      .map(inst => {
                      const isOverdue = inst.due_date && inst.due_date < today && !inst.paid
                      return (
                        <div key={inst.id}
                          className={`rounded-xl p-3 ${
                            inst.paid ? 'bg-green-50' :
                            isOverdue ? 'bg-red-50 border border-red-200' :
                            'bg-gray-50'
                          }`}>
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="font-medium text-sm">งวดที่ {inst.installment_no}</div>
                              {inst.due_date && (
                                <div className={`text-xs mt-0.5 ${
                                  isOverdue ? 'text-red-500 font-bold' : 'text-gray-500'
                                }`}>
                                  📅 {new Date(inst.due_date).toLocaleDateString('th-TH', {
                                    day: 'numeric', month: 'short', year: '2-digit'
                                  })}
                                  {isOverdue && ' ⚠️ เกินกำหนด'}
                                </div>
                              )}
                            </div>
                            <div className="text-right mr-3">
                              <div className="font-bold">{inst.amount.toFixed(2)}฿</div>
                            </div>
                            <button onClick={() => toggleInstallmentPaid(inst)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                inst.paid
                                  ? 'bg-green-500 text-white'
                                  : 'bg-white border-2 border-gray-300 text-gray-400'
                              }`}>
                              {inst.paid ? '✓' : ''}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {showDetail.note && (
                <div className="bg-yellow-50 rounded-xl p-3 mb-3">
                  <div className="text-xs text-yellow-700 font-bold mb-1">หมายเหตุ</div>
                  <div className="text-sm text-gray-700">{showDetail.note}</div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setShowDetail(null); handleDelete(showDetail.id, showDetail.name) }}
                  className="flex-1 bg-red-100 text-red-600 font-bold py-3 rounded-xl">
                  🗑️ ลบ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">{editingDebt ? 'แก้ไขหนี้' : 'เพิ่มหนี้'}</h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 text-xl">✕</button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">รายการ *</label>
                  <input value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="เช่น ตุ๊กตา SPaylater" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">หมวดหมู่</label>
                    <select value={form.category}
                      onChange={e => setForm({...form, category: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                      {DEBT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">ยอดรวม (฿) *</label>
                    <input type="number" step="0.01" value={form.amount}
                      onChange={e => setForm({...form, amount: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                      placeholder="0" />
                  </div>
                </div>

                {/* Toggle ผ่อน */}
                <div className="bg-purple-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-purple-700">📅 แบ่งจ่ายเป็นงวด</div>
                    <div className="text-xs text-purple-500">เปิดสำหรับผ่อน เช่น SPaylater</div>
                  </div>
                  <button onClick={() => setForm({...form, has_installments: !form.has_installments})}
                    className={`relative w-12 h-7 rounded-full transition-colors ${
                      form.has_installments ? 'bg-purple-500' : 'bg-gray-300'
                    }`}>
                    <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                      form.has_installments ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {/* Installments Setup */}
                {form.has_installments ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">จำนวนงวด</label>
                        <input type="number" value={form.total_installments}
                          onChange={e => setForm({...form, total_installments: e.target.value})}
                          className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                          min="1" />
                      </div>
                      <div className="flex items-end">
                        <button onClick={generateInstallments}
                          className="w-full bg-purple-500 text-white rounded-xl p-2 text-sm font-medium">
                          🔄 สร้างงวด
                        </button>
                      </div>
                    </div>

                    {form.installments.length > 0 && (
                      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                        <div className="text-xs text-gray-500 mb-1">ตั้งค่ารายงวด</div>
                        {form.installments.map((inst, i) => (
                          <div key={i} className="bg-white rounded-lg p-2">
                            <div className="text-xs text-gray-500 mb-1">งวดที่ {i + 1}</div>
                            <div className="grid grid-cols-2 gap-2">
                              <input type="number" step="0.01" value={inst.amount}
                                onChange={e => updateInstallment(i, 'amount', e.target.value)}
                                className="border border-gray-200 rounded-lg p-1.5 text-sm"
                                placeholder="จำนวนเงิน" />
                              <input type="date" value={inst.due_date}
                                onChange={e => updateInstallment(i, 'due_date', e.target.value)}
                                className="border border-gray-200 rounded-lg p-1.5 text-sm" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-gray-500">จ่ายไปแล้ว (฿)</label>
                      <input type="number" step="0.01" value={form.paid_amount}
                        onChange={e => setForm({...form, paid_amount: e.target.value})}
                        className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                        placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">วันครบกำหนด</label>
                      <input type="date" value={form.due_date}
                        onChange={e => setForm({...form, due_date: e.target.value})}
                        className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                    </div>
                  </>
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