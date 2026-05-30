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

type ReceiptItem = {
  receipt_id: string
  id: string
  quantity: number
  original_price: number
  item_cost: number
}

type Receipt = {
  id: string
  order_name: string
  order_date: string
  service_fee_actual: number
  cod_actual: number | null
  fee_payer: string | null
  coupon_id: string | null
  items: ReceiptItem[]
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
  receipt?: Receipt | null
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
  const [confirmDialog, setConfirmDialog] = useState<{show:boolean;message:string;onConfirm:()=>void}>({show:false,message:'',onConfirm:()=>{}})

  // ─── state สำหรับเมนู ☰ และโหมดเลือกจ่าย ───
  const [showMenu, setShowMenu] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  function showConfirmModal(message: string, onConfirm: () => void) {
    setConfirmDialog({ show: true, message, onConfirm })
  }
  function closeConfirm() { setConfirmDialog({ show: false, message: '', onConfirm: () => {} }) }

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

    const debtsData = d || []
    const receiptIds = debtsData.map((debt: any) => debt.receipt_id).filter(Boolean)

    let receiptsMap: { [key: string]: Receipt } = {}

    if (receiptIds.length > 0) {
      // ── แยก query เพื่อหลีกเลี่ยง 400 error ──
      const [{ data: receipts }, { data: items }] = await Promise.all([
        supabase
          .from('stock_receipts')
          .select('id, order_name, order_date, service_fee_actual, cod_actual, fee_payer, coupon_id')
          .in('id', receiptIds),
        supabase
          .from('stock_receipt_items')
          .select('receipt_id, id, quantity, original_price, item_cost')
          .in('receipt_id', receiptIds),
      ])

      if (receipts) {
        receipts.forEach((r: any) => {
          receiptsMap[r.id] = {
            ...r,
            items: (items || []).filter((i: any) => i.receipt_id === r.id),
          }
        })
      }
    }

    const combined = debtsData.map((debt: any) => ({
      ...debt,
      receipt: debt.receipt_id ? receiptsMap[debt.receipt_id] || null : null,
    }))

    setDebts(combined)
    setLoading(false)
  }

  function getCODFromReceipt(receipt: Receipt) {
    // ถ้ามีคูปอง ใช้ item_cost, ถ้าไม่มีใช้ original_price
    return receipt.items.reduce((s, i) => {
      return s + (receipt.coupon_id ? i.item_cost : i.original_price)
    }, 0)
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

  async function markDebtPaid(debt: Debt) {
    showConfirmModal(`ยืนยันว่า${isSister ? 'รับเงินจากพี่สาว' : 'จ่ายคืนไวท์'}แล้วค่ะ?`, async () => {
      setSaving(true)
      await supabase.from('debts').update({ paid_amount: debt.amount, status: 'paid' }).eq('id', debt.id)
      setSelectedDebt(null); fetchData(); setSaving(false)
    })
  }

  async function markDebtUnpaid(debt: Debt) {
    setSaving(true)
    await supabase.from('debts').update({ paid_amount: 0, status: 'unpaid' }).eq('id', debt.id)
    setSelectedDebt(null); fetchData(); setSaving(false)
  }

  // ─── จ่ายหลายรายการพร้อมกัน ───
  async function markManyPaid(ids: string[]) {
    if (ids.length === 0) return
    setSaving(true)
    // อัปเดต paid_amount ให้เท่ากับ amount ของแต่ละรายการ + status = paid
    for (const debtId of ids) {
      const debt = debts.find(d => d.id === debtId)
      if (debt) {
        await supabase.from('debts').update({ paid_amount: debt.amount, status: 'paid' }).eq('id', debtId)
      }
    }
    setSelectMode(false); setSelectedIds([]); setShowMenu(false)
    fetchData(); setSaving(false)
  }

  function toggleSelectId(debtId: string) {
    setSelectedIds(prev => prev.includes(debtId) ? prev.filter(x => x !== debtId) : [...prev, debtId])
  }

  async function toggleInstallmentPaid(inst: Installment) {
    setSaving(true)
    const newPaid = !inst.paid
    await supabase.from('debt_installments').update({ paid: newPaid, paid_at: newPaid ? new Date().toISOString() : null }).eq('id', inst.id)
    const debt = debts.find(d => d.id === inst.debt_id)
    if (debt) {
      const updatedInsts = debt.debt_installments.map(i => i.id === inst.id ? { ...i, paid: newPaid } : i)
      const totalPaid = updatedInsts.filter(i => i.paid).reduce((s, i) => s + i.amount, 0)
      const newStatus = totalPaid >= debt.amount ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'
      await supabase.from('debts').update({ status: newStatus }).eq('id', debt.id)
    }
    fetchData()
    if (selectedDebt?.id === inst.debt_id) {
      setSelectedDebt(prev => prev ? { ...prev, debt_installments: prev.debt_installments.map(i => i.id === inst.id ? { ...i, paid: newPaid } : i) } : null)
    }
    setSaving(false)
  }

  async function deleteDebt(debtId: string, name: string) {
    showConfirmModal(`ลบ "${name}"?`, async () => {
      await supabase.from('debts').delete().eq('id', debtId)
      setSelectedDebt(null); fetchData()
    })
  }

  const totalAmount = debts.reduce((s, d) => s + d.amount, 0)
  const totalPaid = debts.reduce((s, d) => s + getPaidAmount(d), 0)
  const totalRemaining = totalAmount - totalPaid

  const pendingDebts = debts.filter(d => getRemaining(d) > 0)
  const paidDebts = debts.filter(d => getRemaining(d) <= 0)

  const emoji = isSister ? '💜' : isWhite ? '💙' : '💳'
  const actionLabel = isSister ? 'รับเงินแล้ว' : isWhite ? 'จ่ายคืนแล้ว' : ''

  const shopNowPayLater = debts.filter(d => !d.has_installments)
  const installmentDebts = debts.filter(d => d.has_installments)
  const monthlyTotal = debts.reduce((sum, debt) => {
    const inst = getCurrentMonthInstallment(debt)
    if (inst) return sum + inst.amount
    return sum
  }, 0)
  const thisMonthInsts = debts.map(d => getCurrentMonthInstallment(d)).filter(Boolean)
  const allPaid = thisMonthInsts.length > 0 && thisMonthInsts.every(i => i?.paid)

  // ยอดรวมของรายการที่เลือกในโหมดเลือกจ่าย
  const selectedTotal = pendingDebts
    .filter(d => selectedIds.includes(d.id))
    .reduce((s, d) => s + getRemaining(d), 0)

  function buildDailySummary() {
    const byDate: { [date: string]: { fee: number; cod: number; count: number } } = {}
    debts.forEach(debt => {
      if (!debt.receipt) return
      const dateStr = debt.receipt.order_date?.split('T')[0] || ''
      if (!dateStr) return
      if (!byDate[dateStr]) byDate[dateStr] = { fee: 0, cod: 0, count: 0 }
      byDate[dateStr].fee += debt.receipt.service_fee_actual || 0
      byDate[dateStr].cod += debt.receipt.cod_actual ?? getCODFromReceipt(debt.receipt)
      byDate[dateStr].count++
    })
    return Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]))
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/debts')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800 flex-1">{emoji} {category?.name}</h1>
          {isSpecial && pendingDebts.length > 0 && !selectMode && (
            <button onClick={() => setShowMenu(true)}
              className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-600 text-lg active:scale-95 transition-transform">☰</button>
          )}
          {selectMode && (
            <button onClick={() => { setSelectMode(false); setSelectedIds([]) }}
              className="text-sm text-gray-500 px-2 active:scale-95">ยกเลิก</button>
          )}
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
        ) : isSpecial ? (
          <>
            {/* Summary */}
            <div className={`rounded-2xl p-4 shadow-sm mb-3 ${isSister ? 'bg-purple-50 border border-purple-100' : 'bg-sky-50 border border-sky-100'}`}>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><div className="text-xs text-gray-500 mb-1">ทั้งหมด</div><div className="font-bold text-gray-800">{totalAmount.toFixed(2)}฿</div></div>
                <div><div className="text-xs text-gray-500 mb-1">ค้างอยู่</div><div className={`font-bold text-lg ${isSister ? 'text-purple-600' : 'text-sky-600'}`}>{totalRemaining.toFixed(2)}฿</div></div>
                <div><div className="text-xs text-gray-500 mb-1">{isSister ? 'รับแล้ว' : 'คืนแล้ว'}</div><div className="font-bold text-green-500">{totalPaid.toFixed(2)}฿</div></div>
              </div>
            </div>

            {/* สรุปตามวัน (พี่สาวเท่านั้น) */}
            {isSister && buildDailySummary().length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="font-bold text-sm text-purple-700">📅 สรุปตามวันที่สั่ง</h3>
                </div>
                {buildDailySummary().map(([dateStr, data]) => {
                  const displayDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
                  return (
                    <div key={dateStr} className="px-4 py-3 border-b border-gray-50 last:border-0">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-bold text-gray-700">📆 {displayDate}</span>
                        <span className="text-xs text-gray-400">{data.count} บิล</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-rose-50 rounded-xl px-3 py-2">
                          <div className="text-xs text-gray-400 mb-0.5">💵 ค่ากดสินค้า</div>
                          <div className="font-bold text-rose-500 text-sm">{data.fee.toFixed(2)}฿</div>
                        </div>
                        <div className="bg-teal-50 rounded-xl px-3 py-2">
                          <div className="text-xs text-gray-400 mb-0.5">📦 COD ปลายทาง</div>
                          <div className="font-bold text-teal-600 text-sm">{data.cod.toFixed(2)}฿</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* รายการค้างอยู่ */}
            {pendingDebts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                  <h3 className={`font-bold text-sm ${isSister ? 'text-purple-700' : 'text-sky-700'}`}>
                    ⏳ ยังค้างอยู่ ({pendingDebts.length} รายการ)
                  </h3>
                  {selectMode && (
                    <button
                      onClick={() => {
                        const allIds = pendingDebts.map(d => d.id)
                        const allSelected = allIds.every(x => selectedIds.includes(x))
                        setSelectedIds(allSelected ? [] : allIds)
                      }}
                      className="text-xs text-sky-600 font-semibold active:scale-95">
                      {pendingDebts.every(d => selectedIds.includes(d.id)) ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                    </button>
                  )}
                </div>
                {pendingDebts.map((debt, index) => {
                  const fee = debt.receipt?.service_fee_actual || 0
                  const cod = debt.receipt ? (debt.receipt.cod_actual ?? getCODFromReceipt(debt.receipt)) : debt.amount
                  const isChecked = selectedIds.includes(debt.id)
                  return (
                    <div key={debt.id}
                      onClick={() => selectMode ? toggleSelectId(debt.id) : setSelectedDebt(debt)}
                      className={`w-full text-left px-4 py-3 active:bg-gray-50 cursor-pointer ${index < pendingDebts.length - 1 ? 'border-b border-gray-100' : ''} ${selectMode && isChecked ? 'bg-sky-50' : ''}`}>
                      <div className="flex justify-between items-start">
                        {selectMode && (
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 mt-0.5 ${isChecked ? 'bg-sky-500 border-sky-500 text-white' : 'border-gray-300'}`}>
                            {isChecked ? '✓' : ''}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{debt.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {new Date(debt.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </div>
                          {debt.receipt && (
                            <div className="flex gap-2 mt-1">
                              {fee > 0 && <span className="text-xs text-rose-400">💵 ค่ากด {fee.toFixed(2)}฿</span>}
                              <span className="text-xs text-teal-500">📦 COD {cod.toFixed(2)}฿</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          <span className={`font-bold text-sm ${isSister ? 'text-purple-600' : 'text-sky-600'}`}>
                            {getRemaining(debt).toFixed(2)}฿
                          </span>
                          {!selectMode && <span className="text-gray-400 text-xs">›</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* รายการจ่ายแล้ว */}
            {paidDebts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="font-bold text-sm text-green-600">✅ {isSister ? 'รับเงินแล้ว' : 'คืนแล้ว'} ({paidDebts.length} รายการ)</h3>
                </div>
                {paidDebts.map((debt, index) => (
                  <button key={debt.id} onClick={() => setSelectedDebt(debt)}
                    className={`w-full text-left px-4 py-3 active:bg-gray-50 opacity-60 ${index < paidDebts.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-600 truncate">{debt.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{new Date(debt.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</div>
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
          <>
            <div className={`rounded-2xl p-4 shadow-sm mb-3 ${allPaid ? 'bg-green-50' : 'bg-white'}`}>
              <div className={`text-3xl font-bold text-center ${allPaid ? 'text-green-500' : 'text-red-500'}`}>
                {monthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}฿
              </div>
              {category?.due_day && (
                <div className="text-xs text-gray-400 text-center mt-1">วันครบกำหนด {category.due_day} {today.toLocaleDateString('th-TH', { month: 'long', year: '2-digit' })}</div>
              )}
              <div className="text-xs text-gray-400 text-center mt-0.5">{debts.length} รายการ</div>
            </div>

            {shopNowPayLater.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-bold text-gray-700 text-sm">💳 ช้อปก่อนจ่ายทีหลัง</h3></div>
                {shopNowPayLater.map((debt, index) => {
                  const remaining = debt.amount - getPaidAmount(debt)
                  return (
                    <button key={debt.id} onClick={() => setSelectedDebt(debt)}
                      className={`w-full text-left px-4 py-3 active:bg-gray-50 ${index < shopNowPayLater.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex justify-between items-center">
                        <div><div className="text-sm font-medium text-gray-800">{debt.name}</div>{debt.note && <div className="text-xs text-gray-400 mt-0.5">{debt.note}</div>}</div>
                        <div className="flex items-center gap-1">
                          <span className={`font-bold text-sm ${remaining <= 0 ? 'text-green-500' : 'text-red-500'}`}>{remaining.toFixed(2)}฿</span>
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
                <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-bold text-gray-700 text-sm">📅 การผ่อนชำระ</h3></div>
                {installmentDebts.map((debt, index) => {
                  const inst = getCurrentMonthInstallment(debt)
                  const paidCount = debt.debt_installments.filter(i => i.paid).length
                  const totalInst = debt.debt_installments.length
                  return (
                    <div key={debt.id} className={`flex items-center px-4 py-3 ${index < installmentDebts.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <button onClick={() => setSelectedDebt(debt)} className="flex-1 text-left">
                        <div className="text-sm font-medium text-gray-800">{debt.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">[งวดที่ {paidCount + 1}/{totalInst}]</div>
                      </button>
                      <div className="flex items-center gap-2 ml-2">
                        <span className={`font-bold text-sm ${inst?.paid ? 'text-green-500' : 'text-red-500'}`}>{(inst?.amount || 0).toFixed(2)}฿</span>
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

        {/* ── เมนู ☰ (bottom sheet) ── */}
        {showMenu && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setShowMenu(false)}>
            <div className="bg-white w-full rounded-t-3xl p-4" onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              <h3 className="font-bold text-gray-800 text-center mb-4">จัดการการจ่าย</h3>
              <button
                onClick={() => showConfirmModal(
                  `${isSister ? 'รับเงิน' : 'จ่ายคืน'}ทั้งหมด ${pendingDebts.length} รายการ\nรวม ${totalRemaining.toFixed(2)}฿?`,
                  () => markManyPaid(pendingDebts.map(d => d.id))
                )}
                className={`w-full text-white font-bold py-3.5 rounded-2xl mb-2 active:scale-95 transition-transform ${isSister ? 'bg-gradient-to-r from-purple-400 to-pink-400' : 'bg-gradient-to-r from-sky-400 to-blue-400'}`}>
                ✅ {isSister ? 'รับเงิน' : 'จ่าย'}ทั้งหมด ({totalRemaining.toFixed(2)}฿)
              </button>
              <button
                onClick={() => { setSelectMode(true); setSelectedIds([]); setShowMenu(false) }}
                className={`w-full bg-white border-2 font-bold py-3.5 rounded-2xl active:scale-95 transition-transform ${isSister ? 'border-purple-300 text-purple-600' : 'border-sky-300 text-sky-600'}`}>
                ☑️ เลือก{isSister ? 'รับ' : 'จ่าย'}เป็นรายการ
              </button>
              <button onClick={() => setShowMenu(false)}
                className="w-full text-gray-400 font-semibold py-3 mt-1 active:scale-95">ยกเลิก</button>
            </div>
          </div>
        )}

        {/* ── แถบล่างตอนเลือกจ่าย ── */}
        {selectMode && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 shadow-lg">
            <div className="max-w-md mx-auto flex items-center gap-3">
              <div className="flex-1">
                <div className="text-xs text-gray-400">เลือก {selectedIds.length} รายการ</div>
                <div className={`font-bold ${isSister ? 'text-purple-600' : 'text-sky-600'}`}>{selectedTotal.toFixed(2)}฿</div>
              </div>
              <button
                onClick={() => showConfirmModal(
                  `${isSister ? 'รับเงิน' : 'จ่าย'} ${selectedIds.length} รายการ\nรวม ${selectedTotal.toFixed(2)}฿?`,
                  () => markManyPaid(selectedIds)
                )}
                disabled={selectedIds.length === 0 || saving}
                className={`text-white font-bold px-6 py-3 rounded-2xl disabled:opacity-40 active:scale-95 transition-transform ${isSister ? 'bg-gradient-to-r from-purple-400 to-pink-400' : 'bg-gradient-to-r from-sky-400 to-blue-400'}`}>
                {saving ? 'กำลังบันทึก...' : `${isSister ? 'รับ' : 'จ่าย'}ที่เลือก`}
              </button>
            </div>
          </div>
        )}

        {/* Detail Popup */}
        {selectedDebt && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg truncate flex-1">{selectedDebt.name}</h3>
                <button onClick={() => setSelectedDebt(null)} className="text-gray-400 text-xl ml-2">✕</button>
              </div>

              {/* ถ้ามี receipt แสดงแยก ค่ากด + COD */}
              {selectedDebt.receipt ? (
                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  {(() => {
                    const r = selectedDebt.receipt!
                    const fee = r.service_fee_actual || 0
                    const cod = r.cod_actual ?? getCODFromReceipt(r)
                    const paidAmt = getPaidAmount(selectedDebt)
                    const remaining = getRemaining(selectedDebt)
                    return (
                      <>
                        {fee > 0 && (
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="text-gray-500">💵 ค่ากดสินค้า{r.fee_payer === 'white' ? ' (ไวท์จ่าย)' : ''}</span>
                            <span className="font-bold text-rose-500">{fee.toFixed(2)}฿</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-500">📦 COD ปลายทาง</span>
                          <span className="font-bold text-teal-600">{cod.toFixed(2)}฿</span>
                        </div>
                        <div className="border-t border-gray-200 pt-2 mt-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-500">ยอดรวม</span>
                            <span className="font-bold">{selectedDebt.amount.toFixed(2)}฿</span>
                          </div>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-500">{isSister ? 'รับแล้ว' : isWhite ? 'คืนแล้ว' : 'จ่ายแล้ว'}</span>
                            <span className="text-green-500 font-bold">{paidAmt.toFixed(2)}฿</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-100 mt-1">
                            <span>คงเหลือ</span>
                            <span className={remaining > 0 ? 'text-red-500' : 'text-green-500'}>{remaining.toFixed(2)}฿</span>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              ) : (
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
              )}

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

              {selectedDebt.has_installments && (
                <div className="mb-3">
                  <h4 className="font-bold text-sm text-gray-700 mb-2">งวดทั้งหมด</h4>
                  <div className="space-y-2">
                    {[...selectedDebt.debt_installments].sort((a, b) => a.installment_no - b.installment_no).map(inst => {
                      const isThisMonth = inst.due_date && (() => {
                        const d = new Date(inst.due_date)
                        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
                      })()
                      return (
                        <div key={inst.id} className={`rounded-xl p-3 ${inst.paid ? 'bg-green-50' : isThisMonth ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="font-medium text-sm flex items-center gap-1">
                                งวดที่ {inst.installment_no}
                                {isThisMonth && <span className="text-xs bg-yellow-200 text-yellow-700 px-1.5 rounded-full">เดือนนี้</span>}
                              </div>
                              {inst.due_date && <div className="text-xs text-gray-400 mt-0.5">{new Date(inst.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</div>}
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

        {/* Confirm Dialog */}
        {confirmDialog.show && (
          <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-xl">
              <p className="font-bold text-gray-800 mb-4 whitespace-pre-line">{confirmDialog.message}</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={closeConfirm} className="bg-gray-100 text-gray-500 py-3 rounded-2xl font-semibold text-sm">ยกเลิก</button>
                <button onClick={() => { closeConfirm(); confirmDialog.onConfirm() }} className="bg-red-400 text-white py-3 rounded-2xl font-bold text-sm">ตกลง</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}