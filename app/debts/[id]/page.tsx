'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

type Installment = {
  id: string
  debt_id: string
  installment_no: number
  amount: number
  due_date: string | null
  paid: boolean
  paid_at: string | null
}

type Debt = {
  id: string
  name: string
  amount: number
  paid_amount: number
  has_installments: boolean
  total_installments: number | null
  debt_category_id: string | null
  note: string | null
  status: string
  debtor: string | null
  creditor: string | null
  receipt_id: string | null
  created_at: string
  debt_installments: Installment[]
}

type DebtCategory = {
  id: string
  name: string
  due_day: number | null
  billing_start_day: number | null
}

const SISTER_CATEGORY_ID = 'ff6cf3f5-db5b-48a4-adce-b1e5057d192b'
const WHITE_CATEGORY_ID = '61f0acb2-54c7-4dc6-9d0d-c06a50a2522b'

export default function DebtCategoryPage() {
  const router = useRouter()
  const { id } = useParams()
  const [category, setCategory] = useState<DebtCategory | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [saving, setSaving] = useState(false)

  const isSpecial = id === SISTER_CATEGORY_ID || id === WHITE_CATEGORY_ID
  const isSister = id === SISTER_CATEGORY_ID
  const isWhite = id === WHITE_CATEGORY_ID

  const today = new Date()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    const [{ data: cat }, { data: d }] = await Promise.all([
      supabase.from('debt_categories').select('*').eq('id', id).single(),
      supabase.from('debts').select('*, debt_installments(*)')
        .eq('debt_category_id', id)
        .order('created_at', { ascending: false }),
    ])
    setCategory(cat)
    setDebts(d || [])
    setLoading(false)
  }

  function getCurrentMonthInstallment(debt: Debt) {
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

  // ─── mark หนี้ว่าจ่ายแล้ว (สำหรับ simple debt ไม่มีงวด) ───
  async function markDebtPaid(debt: Debt) {
    if (!confirm(`ยืนยันว่า${isSister ? 'รับเงินจากพี่สาว' : 'จ่ายคืนไวท์'}แล้วค่ะ?`)) return
    setSaving(true)
    await supabase.from('debts').update({
      paid_amount: debt.amount,
      status: 'paid',
    }).eq('id', debt.id)
    setSelectedDebt(null)
    fetchData()
    setSaving(false)
  }

  async function markDebtUnpaid(debt: Debt) {
    setSaving(true)
    await supabase.from('debts').update({
      paid_amount: 0,
      status: 'unpaid',
    }).eq('id', debt.id)
    setSelectedDebt(null)
    fetchData()
    setSaving(false)
  }

  async function toggleInstallmentPaid(inst: Installment) {
    setSaving(true)
    const newPaid = !inst.paid
    await supabase.from('debt_installments').update({
      paid: newPaid,
      paid_at: newPaid ? new Date().toISOString() : null,
    }).eq('id', inst.id)

    const debt = debts.find(d => d.id === inst.debt_id)
    if (debt) {
      const updatedInsts = debt.debt_installments.map(i =>
        i.id === inst.id ? { ...i, paid: newPaid } : i
      )
      const totalPaid = updatedInsts.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
      const newStatus = totalPaid >= debt.amount ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'
      await supabase.from('debts').update({ status: newStatus }).eq('id', debt.id)
    }

    fetchData()
    if (selectedDebt?.id === inst.debt_id) {
      setSelectedDebt(prev => prev ? {
        ...prev,
        debt_installments: prev.debt_installments.map(i =>
          i.id === inst.id ? { ...i, paid: newPaid } : i
        )
      } : null)
    }
    setSaving(false)
  }

  async function deleteDebt(debtId: string, name: string) {
    if (!confirm(`ลบ "${name}"?`)) return
    await supabase.from('debts').delete().eq('id', debtId)
    setSelectedDebt(null)
    fetchData()
  }

  // ─── Summary ───
  const totalAmount = debts.reduce((s, d) => s + d.amount, 0)
  const totalPaid = debts.reduce((s, d) => s + getPaidAmount(d), 0)
  const totalRemaining = totalAmount - totalPaid

  const pendingDebts = debts.filter(d => getRemaining(d) > 0)
  const paidDebts = debts.filter(d => getRemaining(d) <= 0)

  const accentColor = isSister ? 'purple' : isWhite ? 'sky' : 'red'
  const emoji = isSister ? '💜' : isWhite ? '💙' : '💳'
  const actionLabel = isSister ? 'รับเงินแล้ว' : isWhite ? 'จ่ายคืนแล้ว' : ''

  // non-special
  const shopNowPayLater = debts.filter(d => !d.has_installments)
  const installmentDebts = debts.filter(d => d.has_installments)
  const monthlyTotal = debts.reduce((sum, debt) => {
    const inst = getCurrentMonthInstallment(debt)
    if (inst) return sum + inst.amount
    return sum
  }, 0)
  const thisMonthInsts = debts.map(d => getCurrentMonthInstallment(d)).filter(Boolean)
  const allPaid = thisMonthInsts.length > 0 && thisMonthInsts.every(i => i?.paid)

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/debts')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">{emoji} {category?.name}</h1>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
        ) : isSpecial ? (
          /* ══ หน้า Special: พี่สาว / ไวท์ ══ */
          <>
            {/* Summary */}
            <div className={`rounded-2xl p-4 shadow-sm mb-3 ${isSister ? 'bg-purple-50 border border-purple-100' : 'bg-sky-50 border border-sky-100'}`}>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xs text-gray-500 mb-1">ทั้งหมด</div>
                  <div className="font-bold text-gray-800">{totalAmount.toFixed(2)}฿</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">ค้างอยู่</div>
                  <div className={`font-bold text-lg ${isSister ? 'text-purple-600' : 'text-sky-600'}`}>
                    {totalRemaining.toFixed(2)}฿
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">{isSister ? 'รับแล้ว' : 'คืนแล้ว'}</div>
                  <div className="font-bold text-green-500">{totalPaid.toFixed(2)}฿</div>
                </div>
              </div>
            </div>

            {/* ─── รายการค้างอยู่ ─── */}
            {pendingDebts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className={`font-bold text-sm ${isSister ? 'text-purple-700' : 'text-sky-700'}`}>
                    ⏳ ยังค้างอยู่ ({pendingDebts.length} รายการ)
                  </h3>
                </div>
                {pendingDebts.map((debt, index) => (
                  <button key={debt.id} onClick={() => setSelectedDebt(debt)}
                    className={`w-full text-left px-4 py-3 active:bg-gray-50 ${index < pendingDebts.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">{debt.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(debt.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                          {debt.note && ` · ${debt.note.replace(/receipt_id:.+/, '').trim()}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <span className={`font-bold text-sm ${isSister ? 'text-purple-600' : 'text-sky-600'}`}>
                          {getRemaining(debt).toFixed(2)}฿
                        </span>
                        <span className="text-gray-400 text-xs">›</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ─── รายการจ่ายแล้ว ─── */}
            {paidDebts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="font-bold text-sm text-green-600">
                    ✅ {isSister ? 'รับเงินแล้ว' : 'คืนแล้ว'} ({paidDebts.length} รายการ)
                  </h3>
                </div>
                {paidDebts.map((debt, index) => (
                  <button key={debt.id} onClick={() => setSelectedDebt(debt)}
                    className={`w-full text-left px-4 py-3 active:bg-gray-50 opacity-60 ${index < paidDebts.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-600 truncate">{debt.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {new Date(debt.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                        <span className="font-bold text-sm text-green-500">{debt.amount.toFixed(2)}฿</span>
                        <span className="text-green-400 text-xs">✓</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {debts.length === 0 && (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">{emoji}</div>
                <p className="text-sm">ยังไม่มีรายการค่ะ</p>
              </div>
            )}
          </>
        ) : (
          /* ══ หน้า Normal Category ══ */
          <>
            <div className={`rounded-2xl p-4 shadow-sm mb-3 ${allPaid ? 'bg-green-50' : 'bg-white'}`}>
              <div className={`text-3xl font-bold text-center ${allPaid ? 'text-green-500' : 'text-red-500'}`}>
                {monthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
              </div>
              {category?.due_day && (
                <div className="text-xs text-gray-400 text-center mt-1">
                  วันครบกำหนด {category.due_day} {today.toLocaleDateString('th-TH', { month: 'long', year: '2-digit' })}
                </div>
              )}
              <div className="text-xs text-gray-400 text-center mt-0.5">
                {debts.length} รายการ
              </div>
            </div>

            {shopNowPayLater.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="font-bold text-gray-700 text-sm">💳 ช้อปก่อนจ่ายทีหลัง</h3>
                </div>
                {shopNowPayLater.map((debt, index) => {
                  const remaining = debt.amount - getPaidAmount(debt)
                  return (
                    <button key={debt.id} onClick={() => setSelectedDebt(debt)}
                      className={`w-full text-left px-4 py-3 active:bg-gray-50 ${index < shopNowPayLater.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-800">{debt.name}</div>
                          {debt.note && <div className="text-xs text-gray-400 mt-0.5">{debt.note}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold text-sm ${remaining <= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {remaining.toFixed(2)}฿
                          </span>
                          <span className="text-gray-400 text-xs">›</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {installmentDebts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="font-bold text-gray-700 text-sm">📅 การผ่อนชำระ</h3>
                </div>
                {installmentDebts.map((debt, index) => {
                  const inst = getCurrentMonthInstallment(debt)
                  const paidCount = debt.debt_installments.filter(i => i.paid).length
                  const totalInst = debt.debt_installments.length
                  return (
                    <div key={debt.id}
                      className={`flex items-center px-4 py-3 ${index < installmentDebts.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <button onClick={() => setSelectedDebt(debt)} className="flex-1 text-left">
                        <div className="text-sm font-medium text-gray-800">{debt.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">[งวดที่ {paidCount + 1}/{totalInst}]</div>
                      </button>
                      <div className="flex items-center gap-2 ml-2">
                        <span className={`font-bold text-sm ${inst?.paid ? 'text-green-500' : 'text-red-500'}`}>
                          {(inst?.amount || 0).toFixed(2)}฿
                        </span>
                        {inst && (
                          <button onClick={() => toggleInstallmentPaid(inst)} disabled={saving}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${inst.paid ? 'bg-green-500 text-white' : 'bg-white border-2 border-gray-300 text-gray-400'}`}>
                            {inst.paid ? '✓' : ''}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ══ Detail Popup ══ */}
        {selectedDebt && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg truncate flex-1">{selectedDebt.name}</h3>
                <button onClick={() => setSelectedDebt(null)} className="text-gray-400 text-xl ml-2">✕</button>
              </div>

              {/* Info */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">ยอดรวม</span>
                  <span className="font-bold">{selectedDebt.amount.toFixed(2)}฿</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">{isSister ? 'รับแล้ว' : isWhite ? 'คืนแล้ว' : 'จ่ายแล้ว'}</span>
                  <span className="text-green-500 font-bold">{getPaidAmount(selectedDebt).toFixed(2)}฿</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200 mt-2">
                  <span>คงเหลือ</span>
                  <span className="text-red-500">{getRemaining(selectedDebt).toFixed(2)}฿</span>
                </div>
              </div>

              {/* ปุ่มสำหรับ special category */}
              {isSpecial && !selectedDebt.has_installments && (
                <div className="mb-3">
                  {getRemaining(selectedDebt) > 0 ? (
                    <button onClick={() => markDebtPaid(selectedDebt)} disabled={saving}
                      className={`w-full font-bold py-3 rounded-2xl text-white disabled:opacity-50 ${isSister ? 'bg-gradient-to-r from-purple-400 to-pink-400' : 'bg-gradient-to-r from-sky-400 to-blue-400'}`}>
                      {saving ? 'กำลังบันทึก...' : `${emoji} ${actionLabel} ${selectedDebt.amount.toFixed(2)}฿`}
                    </button>
                  ) : (
                    <button onClick={() => markDebtUnpaid(selectedDebt)} disabled={saving}
                      className="w-full bg-gray-100 text-gray-500 font-bold py-3 rounded-2xl disabled:opacity-50">
                      ↩️ ยกเลิกการรับ/จ่าย
                    </button>
                  )}
                </div>
              )}

              {/* Installments */}
              {selectedDebt.has_installments && (
                <div className="mb-3">
                  <h4 className="font-bold text-sm text-gray-700 mb-2">งวดทั้งหมด</h4>
                  <div className="space-y-2">
                    {[...selectedDebt.debt_installments]
                      .sort((a, b) => a.installment_no - b.installment_no)
                      .map(inst => {
                        const isThisMonth = inst.due_date && (() => {
                          const d = new Date(inst.due_date)
                          return d.getMonth() === currentMonth && d.getFullYear() === currentYear
                        })()
                        return (
                          <div key={inst.id}
                            className={`rounded-xl p-3 ${inst.paid ? 'bg-green-50' : isThisMonth ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium text-sm flex items-center gap-1">
                                  งวดที่ {inst.installment_no}
                                  {isThisMonth && <span className="text-xs bg-yellow-200 text-yellow-700 px-1.5 rounded-full">เดือนนี้</span>}
                                </div>
                                {inst.due_date && (
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {new Date(inst.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-sm">{inst.amount.toFixed(2)}฿</span>
                                <button onClick={() => toggleInstallmentPaid(inst)} disabled={saving}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${inst.paid ? 'bg-green-500 text-white' : 'bg-white border-2 border-gray-300 text-gray-400'}`}>
                                  {inst.paid ? '✓' : ''}
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {selectedDebt.note && !selectedDebt.note.startsWith('receipt_id:') && (
                <div className="bg-yellow-50 rounded-xl p-3 mb-3">
                  <div className="text-xs text-yellow-700 font-bold mb-1">หมายเหตุ</div>
                  <div className="text-sm">{selectedDebt.note}</div>
                </div>
              )}

              <button onClick={() => deleteDebt(selectedDebt.id, selectedDebt.name)}
                className="w-full bg-red-100 text-red-600 font-bold py-3 rounded-2xl">
                🗑️ ลบรายการนี้
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}