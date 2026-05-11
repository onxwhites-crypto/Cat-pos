'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function OrderDetailPopup({
  order,
  onClose,
  onCancelled,
  onUpdated,
}: {
  order: any
  onClose: () => void
  onCancelled: () => void
  onUpdated: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editTab, setEditTab] = useState<'add' | 'pay'>('add')
  const [paidAmount, setPaidAmount] = useState(0)
  const [saving, setSaving] = useState(false)

  if (!order) return null

  const remaining = order.total - paidAmount

  // ── ยกเลิกบิล ──
  async function handleCancel() {
    if (!confirm(`ยืนยันยกเลิกบิลของ ${order.customers?.name || 'ลูกค้าทั่วไป'}?`)) return
    setSaving(true)
    try {
      await supabase.from('deliveries').delete().eq('order_id', order.id)
      if (order.order_type !== 'reservation') {
        for (const item of order.order_items || []) {
          const { data: product } = await supabase.from('products').select('stock_qty').eq('id', item.product_id).single()
          if (product) {
            await supabase.from('products').update({ stock_qty: product.stock_qty + item.quantity }).eq('id', item.product_id)
            await supabase.from('stock_movements').insert({
              product_id: item.product_id, type: 'IN',
              quantity: item.quantity, ref_type: 'cancel', ref_id: order.id,
            })
          }
        }
      }
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
      alert('ยกเลิกบิลเรียบร้อยค่ะ')
      onCancelled()
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  // ── บันทึกจ่ายที่เหลือ ──
  async function handleSavePay() {
    if (paidAmount <= 0) { alert('กรุณากรอกยอดที่จ่ายค่ะ'); return }
    setSaving(true)
    try {
      const newStatus = paidAmount >= order.total ? 'paid' : 'pending'
      await supabase.from('orders').update({
        payment_status: newStatus,
        paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
      }).eq('id', order.id)
      alert(newStatus === 'paid' ? '✅ จ่ายครบแล้วค่ะ!' : `บันทึกแล้วค่ะ ยังค้างอีก ฿${remaining.toLocaleString()}`)
      onUpdated()
    } catch { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  // ── ไปเพิ่มสินค้าในหน้า POS ──
function handleAddItems() {
  const params = new URLSearchParams({
    edit_order_id: order.id,
    edit_customer: order.customers?.name || '',
    edit_customer_id: order.customer_id || '',
  })
  router.push(`/pos?${params.toString()}`)
  onClose()
}

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={onClose}>
      <div
        className="bg-[#fff5f3] w-full rounded-t-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex justify-between items-center px-4 py-2 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">
              {order.customers?.name || 'ลูกค้าทั่วไป'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(order.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
              {' · '}
              {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              {order.order_type === 'reservation' && ' · 🏪 ฝากของ'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-xl w-8 h-8 flex items-center justify-center">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">

          {/* ── VIEW MODE ── */}
          {mode === 'view' && (
            <div className="space-y-3">

              {/* สถานะ */}
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex justify-between items-center">
                <span className={`text-sm font-bold ${order.payment_status === 'paid' ? 'text-teal-500' : 'text-amber-500'}`}>
                  {order.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                </span>
                <span className="text-xl font-extrabold text-rose-500">{order.total?.toLocaleString()}฿</span>
              </div>

              {/* รายการสินค้า */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {(order.order_items || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center px-4 py-3 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{item.products?.name || '-'}</p>
                      <p className="text-xs text-gray-400">{item.quantity} × {item.unit_price?.toLocaleString()}฿</p>
                    </div>
                    <p className="text-sm font-bold text-rose-500">{(item.quantity * item.unit_price).toLocaleString()}฿</p>
                  </div>
                ))}
                {/* ยอดรวม */}
                <div className="flex justify-between items-center px-4 py-3 bg-gray-50">
                  <span className="font-bold text-gray-700">รวมทั้งสิ้น</span>
                  <span className="font-extrabold text-rose-500 text-lg">{order.total?.toLocaleString()}฿</span>
                </div>
              </div>

              {/* ปุ่ม แก้ไข + ยกเลิก */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setMode('edit')}
                  className="bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3.5 rounded-2xl text-sm active:scale-95 transition-transform"
                >
                  ✏️ แก้ไขบิล
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="bg-red-50 text-red-400 font-bold py-3.5 rounded-2xl text-sm active:scale-95 transition-transform disabled:opacity-50"
                >
                  ❌ ยกเลิกบิล
                </button>
              </div>
            </div>
          )}

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <div className="space-y-3">

              {/* ปุ่มย้อนกลับ */}
              <button
                onClick={() => setMode('view')}
                className="flex items-center gap-1 text-sm text-gray-400 active:scale-95 transition-transform"
              >
                ← กลับ
              </button>

              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditTab('add')}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${editTab === 'add' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-white text-gray-400 shadow-sm'}`}
                >
                  🛒 เพิ่มสินค้า
                </button>
                <button
                  onClick={() => setEditTab('pay')}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all ${editTab === 'pay' ? 'bg-gradient-to-r from-teal-400 to-green-400 text-white' : 'bg-white text-gray-400 shadow-sm'}`}
                >
                  💰 จ่ายที่เหลือ
                </button>
              </div>

              {/* Tab: เพิ่มสินค้า */}
              {editTab === 'add' && (
                <div className="space-y-3">
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">บิลปัจจุบัน</p>
                    <p className="font-bold text-gray-800">{order.customers?.name || 'ลูกค้าทั่วไป'}</p>
                    <p className="text-xs text-gray-400">{order.order_items?.length || 0} รายการ · {order.total?.toLocaleString()}฿</p>
                  </div>

                  <div className="bg-amber-50 rounded-2xl p-4">
                    <p className="text-sm text-amber-700 font-semibold mb-1">📌 วิธีเพิ่มสินค้า</p>
                    <p className="text-xs text-amber-600">กดปุ่มด้านล่างเพื่อกลับไปหน้าขายของ แล้วเลือกสินค้าที่ต้องการเพิ่ม ระบบจะบันทึกเข้าบิลนี้อัตโนมัติค่ะ</p>
                  </div>

                  <button
                    onClick={handleAddItems}
                    className="w-full bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold py-4 rounded-2xl active:scale-95 transition-transform"
                  >
                    🛒 ไปเลือกสินค้าเพิ่ม →
                  </button>
                </div>
              )}

              {/* Tab: จ่ายที่เหลือ */}
              {editTab === 'pay' && (
                <div className="space-y-3">

                  {/* ยอดรวม */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">ยอดรวมทั้งหมด</span>
                      <span className="font-bold text-gray-800">{order.total?.toLocaleString()}฿</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">สถานะ</span>
                      <span className={`font-bold ${order.payment_status === 'paid' ? 'text-teal-500' : 'text-amber-500'}`}>
                        {order.payment_status === 'paid' ? '✅ จ่ายแล้ว' : '⏳ ค้างชำระ'}
                      </span>
                    </div>
                  </div>

                  {/* ช่องกรอกจ่ายมาแล้ว */}
                  <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
                      จ่ายมาแล้ว (฿)
                    </label>
                    <input
                      type="number"
                      value={paidAmount || ''}
                      onChange={e => setPaidAmount(Number(e.target.value))}
                      className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-lg font-bold outline-none text-center"
                      placeholder="0"
                    />

                    {/* คำนวณยอดค้าง */}
                    {paidAmount > 0 && (
                      <div className={`rounded-2xl px-4 py-3 text-center ${remaining <= 0 ? 'bg-teal-50' : 'bg-rose-50'}`}>
                        {remaining <= 0 ? (
                          <p className="text-teal-600 font-bold text-sm">✅ จ่ายครบแล้วค่ะ!</p>
                        ) : (
                          <>
                            <p className="text-xs text-gray-400 mb-0.5">ยังค้างอีก</p>
                            <p className="text-rose-500 font-extrabold text-2xl">{remaining.toLocaleString()}฿</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleSavePay}
                    disabled={saving || paidAmount <= 0}
                    className="w-full bg-gradient-to-r from-teal-400 to-green-400 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-95 transition-transform"
                  >
                    {saving ? 'กำลังบันทึก...' : '✅ บันทึกการจ่าย'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}