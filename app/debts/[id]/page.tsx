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
  debt_installments: Installment[]
}

type DebtCategory = {
  id: string
  name: string
  due_day: number | null
  billing_start_day: number | null
}

export default function DebtCategoryPage() {
  const router = useRouter()
  const { id } = useParams()
  const [category, setCategory] = useState<DebtCategory | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [saving, setSaving] = useState(false)

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

  function getMonthName() {
    return today.toLocaleDateString('th-TH', { month: 'long', year: '2-digit' })
  }

  // ยอดรวมเดือนนี้
  const monthlyTotal = debts.reduce((sum, debt) => {
    const inst = getCurrentMonthInstallment(debt)
    if (inst) return sum + inst.amount
    return sum
  }, 0)

  // สถานะเดือนนี้
  const thisMonthInsts = debts.map(d => getCurrentMonthInstallment(d)).filter(Boolean)
  const allPaid = thisMonthInsts.length > 0 && thisMonthInsts.every(i => i?.paid)

  async function toggleInstallmentPaid(inst: Installment) {
    setSaving(true)
    const newPaid = !inst.paid
    await supabase.from('debt_installments').update({
      paid: newPaid,
      paid_at: newPaid ? new Date().toISOString() : null,
    }).eq('id', inst.id)

    // อัพเดท status ของ debt
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
    // อัพเดท selectedDebt
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

  async function deleteDebt(id: string, name: string) {
    if (!confirm(`ลบ "${name}"?`)) return
    await supabase.from('debts').delete().eq('id', id)
    setSelectedDebt(null)
    fetchData()
  }

  // แบ่ง debts เป็น 2 กลุ่ม
  const shopNowPayLater = debts.filter(d => !d.has_installments)
  const installmentDebts = debts.filter(d => d.has_installments)

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/debts')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">💳 {category?.name}</h1>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
        ) : (
          <>
            {/* ยอดรวมเดือนนี้ */}
            <div className={`rounded-2xl p-4 shadow-sm mb-3 ${allPaid ? 'bg-green-50' : 'bg-white'}`}>
              <div className={`text-3xl font-bold text-center ${allPaid ? 'text-green-500' : 'text-red-500'}`}>
                {monthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
              </div>
              {category?.due_day && (
                <div className="text-xs text-gray-400 text-center mt-1">
                  วันครบกำหนด {category.due_day} {getMonthName()}
                </div>
              )}
              <div className="text-xs text-gray-400 text-center mt-0.5">
                {debts.length} รายการ ·{' '}
                {category?.billing_start_day || 1} -{' '}
                {new Date(currentYear, currentMonth + 1, 0).getDate()}{' '}
                {today.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })}
              </div>
            </div>

            {/* ช้อปก่อนจ่ายทีหลัง */}
            {shopNowPayLater.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="font-bold text-gray-700 text-sm">💳 ช้อปก่อนจ่ายทีหลัง</h3>
                </div>
                {shopNowPayLater.map((debt, index) => {
                  const inst = getCurrentMonthInstallment(debt)
                  const remaining = debt.amount - getPaidAmount(debt)
                  return (
                    <button key={debt.id} onClick={() => setSelectedDebt(debt)}
                      className={`w-full text-left px-4 py-3 active:bg-gray-50 ${
                        index < shopNowPayLater.length - 1 ? 'border-b border-gray-100' : ''
                      }`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-800">{debt.name}</div>
                          {debt.note && (
                            <div className="text-xs text-gray-400 mt-0.5">{debt.note}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold text-sm ${inst?.paid ? 'text-green-500' : 'text-red-500'}`}>
                            +{remaining.toFixed(2)}฿
                          </span>
                          <span className="text-gray-400 text-xs">›</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* การผ่อนชำระ */}
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
      className={`flex items-center px-4 py-3 ${
        index < installmentDebts.length - 1 ? 'border-b border-gray-100' : ''
      }`}>
      {/* ชื่อ + งวด → กดดูรายละเอียด */}
      <button onClick={() => setSelectedDebt(debt)} className="flex-1 text-left">
        <div className="text-sm font-medium text-gray-800">{debt.name}</div>
        <div className="text-xs text-gray-400 mt-0.5">
          [งวดที่ {paidCount + 1}/{totalInst}]
        </div>
      </button>
      {/* ยอด + ปุ่มติ๊ก */}
      <div className="flex items-center gap-2 ml-2">
        <span className={`font-bold text-sm ${inst?.paid ? 'text-green-500' : 'text-red-500'}`}>
          {(inst?.amount || 0).toFixed(2)}฿
        </span>
        {inst && (
          <button onClick={() => toggleInstallmentPaid(inst)} disabled={saving}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              inst.paid ? 'bg-green-500 text-white' : 'bg-white border-2 border-gray-300 text-gray-400'
            }`}>
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

        {/* Detail Popup */}
        {selectedDebt && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">{selectedDebt.name}</h3>
                <button onClick={() => setSelectedDebt(null)} className="text-gray-400 text-xl">✕</button>
              </div>

              {/* Info */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ยอดรวม</span>
                  <span className="font-bold">{selectedDebt.amount.toFixed(2)}฿</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">จ่ายแล้ว</span>
                  <span className="text-green-500 font-bold">{getPaidAmount(selectedDebt).toFixed(2)}฿</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200 mt-2">
                  <span>คงเหลือ</span>
                  <span className="text-red-500">{(selectedDebt.amount - getPaidAmount(selectedDebt)).toFixed(2)}฿</span>
                </div>
              </div>

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
                            className={`rounded-xl p-3 ${
                              inst.paid ? 'bg-green-50' :
                              isThisMonth ? 'bg-yellow-50 border border-yellow-200' :
                              'bg-gray-50'
                            }`}>
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium text-sm flex items-center gap-1">
                                  งวดที่ {inst.installment_no}
                                  {isThisMonth && <span className="text-xs bg-yellow-200 text-yellow-700 px-1.5 rounded-full">เดือนนี้</span>}
                                </div>
                                {inst.due_date && (
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {new Date(inst.due_date).toLocaleDateString('th-TH', {
                                      day: 'numeric', month: 'short', year: '2-digit'
                                    })}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-sm">{inst.amount.toFixed(2)}฿</span>
                                <button onClick={() => toggleInstallmentPaid(inst)} disabled={saving}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                    inst.paid ? 'bg-green-500 text-white' : 'bg-white border-2 border-gray-300 text-gray-400'
                                  }`}>
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

              {selectedDebt.note && (
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