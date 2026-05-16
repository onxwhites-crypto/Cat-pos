'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Item = { id: string; name: string; sort_order?: number }
type DebtCategory = { id: string; name: string; due_day: number | null; billing_start_day: number | null }
type Coupon = {
  id: string
  name: string
  platform_id: string | null
  discount_type: string
  discount_value: number
  display_value: number | null
  max_discount: number | null
  min_purchase: number
  service_fee_formula: string
  service_fee: number | null
  is_active: boolean
}
type Platform = { id: string; name: string }

const TABS = [
  { key: 'categories', label: '📦 หมวดหมู่สินค้า', table: 'categories', sortable: true },
  { key: 'zones', label: '📍 โซนส่งของ', table: 'zones', sortable: true },
  { key: 'platforms', label: '🛍️ แพลตฟอร์ม', table: 'platforms', sortable: false },
  { key: 'operators', label: '👤 คนกด', table: 'operators', sortable: false },
  { key: 'coupons', label: '🎟️ คูปอง', table: 'coupons', sortable: false },
  { key: 'debt_categories', label: '💳 หมวดหมู่หนี้สิน', table: 'debt_categories', sortable: false },
]

const DISCOUNT_TYPES = [
  { value: 'flat', label: 'ลดคงที่ (฿)' },
  { value: 'percent', label: 'ลด % (มีขั้นต่ำ)' },
  { value: 'percent_cap', label: 'ลด % (มี cap)' },
  { value: 'fixed', label: 'จ่ายคงที่ (฿)' },
]

const FEE_FORMULAS = [
  { value: 'fixed', label: 'ค่ากดคงที่' },
  { value: 'half', label: 'ครึ่งหนึ่งของส่วนลด' },
  { value: 'manual', label: 'กรอกเองทุกครั้ง' },
]

const emptyCouponForm = {
  name: '', platform_id: '', discount_type: 'flat',
  discount_value: 0, display_value: '', max_discount: '',
  min_purchase: 0, service_fee_formula: 'fixed', service_fee: 0, is_active: true,
}

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('categories')
  const [items, setItems] = useState<Item[]>([])
  const [debtCategories, setDebtCategories] = useState<DebtCategory[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [newName, setNewName] = useState('')
  const [newDueDay, setNewDueDay] = useState('')
  const [newBillingStartDay, setNewBillingStartDay] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDueDay, setEditDueDay] = useState('')
  const [editBillingStartDay, setEditBillingStartDay] = useState('')

  // coupon form
  const [showCouponForm, setShowCouponForm] = useState(false)
  const [couponForm, setCouponForm] = useState<typeof emptyCouponForm>({ ...emptyCouponForm })
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const currentTab = TABS.find(t => t.key === activeTab)!
  const isDebtCategories = activeTab === 'debt_categories'
  const isCoupons = activeTab === 'coupons'
  const isSortable = currentTab.sortable

  useEffect(() => { fetchItems() }, [activeTab])

  async function fetchItems() {
    if (isCoupons) {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('coupons').select('*').order('name'),
        supabase.from('platforms').select('*'),
      ])
      setCoupons(c || [])
      setPlatforms(p || [])
      return
    }
    if (isSortable) {
      const { data } = await supabase.from(currentTab.table).select('*').order('sort_order', { ascending: true })
      setItems(data || [])
    } else if (isDebtCategories) {
      const { data } = await supabase.from(currentTab.table).select('*').order('name')
      setDebtCategories((data || []) as DebtCategory[])
    } else {
      const { data } = await supabase.from(currentTab.table).select('*').order('name')
      setItems(data || [])
    }
    // load platforms for coupon form
    const { data: p } = await supabase.from('platforms').select('*')
    setPlatforms(p || [])
  }

  async function handleAdd() {
    if (!newName.trim()) return
    if (isDebtCategories) {
      await supabase.from('debt_categories').insert({
        name: newName.trim(),
        due_day: newDueDay ? Number(newDueDay) : null,
        billing_start_day: newBillingStartDay ? Number(newBillingStartDay) : null,
      })
      setNewDueDay(''); setNewBillingStartDay('')
    } else if (isSortable) {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.sort_order || 0)) : 0
      await supabase.from(currentTab.table).insert({ name: newName.trim(), sort_order: maxOrder + 1 })
    } else {
      await supabase.from(currentTab.table).insert({ name: newName.trim() })
    }
    setNewName('')
    fetchItems()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ลบ "${name}" ออกจากระบบ?`)) return
    await supabase.from(currentTab.table).delete().eq('id', id)
    fetchItems()
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return
    if (isDebtCategories) {
      await supabase.from('debt_categories').update({
        name: editName.trim(),
        due_day: editDueDay ? Number(editDueDay) : null,
        billing_start_day: editBillingStartDay ? Number(editBillingStartDay) : null,
      }).eq('id', id)
    } else {
      await supabase.from(currentTab.table).update({ name: editName.trim() }).eq('id', id)
    }
    setEditingId(null); setEditName(''); setEditDueDay(''); setEditBillingStartDay('')
    fetchItems()
  }

  function startEdit(item: any) {
    setEditingId(item.id)
    setEditName(item.name)
    if (isDebtCategories) {
      setEditDueDay(item.due_day?.toString() || '')
      setEditBillingStartDay(item.billing_start_day?.toString() || '')
    }
  }

  // ── Coupon ──
  function openAddCoupon() {
    setCouponForm({ ...emptyCouponForm })
    setEditingCouponId(null)
    setShowCouponForm(true)
  }

  function openEditCoupon(c: Coupon) {
    setCouponForm({
      name: c.name,
      platform_id: c.platform_id || '',
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      display_value: c.display_value?.toString() || '',
      max_discount: c.max_discount?.toString() || '',
      min_purchase: c.min_purchase,
      service_fee_formula: c.service_fee_formula,
      service_fee: c.service_fee || 0,
      is_active: c.is_active,
    })
    setEditingCouponId(c.id)
    setShowCouponForm(true)
  }

  async function handleSaveCoupon() {
    if (!couponForm.name.trim()) { alert('กรุณากรอกชื่อคูปองค่ะ'); return }
    setSaving(true)
    const payload = {
      name: couponForm.name.trim(),
      platform_id: couponForm.platform_id || null,
      discount_type: couponForm.discount_type,
      discount_value: Number(couponForm.discount_value),
      display_value: couponForm.display_value !== '' ? Number(couponForm.display_value) : null,
      max_discount: couponForm.max_discount !== '' ? Number(couponForm.max_discount) : null,
      min_purchase: Number(couponForm.min_purchase),
      service_fee_formula: couponForm.service_fee_formula,
      service_fee: Number(couponForm.service_fee),
      is_active: couponForm.is_active,
    }
    if (editingCouponId) {
      await supabase.from('coupons').update(payload).eq('id', editingCouponId)
    } else {
      await supabase.from('coupons').insert(payload)
    }
    setShowCouponForm(false)
    setEditingCouponId(null)
    fetchItems()
    setSaving(false)
  }

  async function handleDeleteCoupon(id: string, name: string) {
    if (!confirm(`ลบคูปอง "${name}"?`)) return
    await supabase.from('coupons').delete().eq('id', id)
    fetchItems()
  }

  async function toggleCouponActive(c: Coupon) {
    await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id)
    fetchItems()
  }

  // ── Drag ──
  function handleDragStart(index: number) { dragItem.current = index; setDragIndex(index) }
  function handleDragEnter(index: number) { dragOverItem.current = index; setDropIndex(index) }
  function handleDragEnd() { setDragIndex(null); setDropIndex(null) }

  async function handleDrop() {
    if (dragItem.current === null || dragOverItem.current === null) return
    if (dragItem.current === dragOverItem.current) {
      setDragIndex(null); setDropIndex(null)
      dragItem.current = null; dragOverItem.current = null; return
    }
    setSaving(true)
    const newItems = [...items]
    const dragged = newItems.splice(dragItem.current, 1)[0]
    newItems.splice(dragOverItem.current, 0, dragged)
    for (let i = 0; i < newItems.length; i++) {
      await supabase.from(currentTab.table).update({ sort_order: i + 1 }).eq('id', newItems[i].id)
    }
    dragItem.current = null; dragOverItem.current = null
    setDragIndex(null); setDropIndex(null)
    setSaving(false)
    fetchItems()
  }

  return (
    <main className="min-h-screen bg-[#fff5f3]">
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.push('/')}
            className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform">←</button>
          <h1 className="text-lg font-bold text-gray-800">⚙️ ตั้งค่า</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 rounded-xl text-xs whitespace-nowrap font-semibold flex-shrink-0 transition-all ${activeTab === tab.key ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-500 shadow-sm'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-8 pt-2 space-y-3">

        {/* ══ TAB: คูปอง ══ */}
        {isCoupons ? (
          <>
            <button onClick={openAddCoupon}
              className="w-full bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3 rounded-2xl active:scale-95 transition-transform">
              + เพิ่มคูปองใหม่
            </button>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-bold text-gray-700 mb-3">🎟️ คูปองทั้งหมด</h3>
              {coupons.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีคูปองค่ะ</p>
              ) : (
                <div className="space-y-2">
                  {coupons.map(c => {
                    const plat = platforms.find(p => p.id === c.platform_id)
                    return (
                      <div key={c.id} className={`bg-gray-50 rounded-xl p-3 ${!c.is_active ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-800">{c.name}</span>
                              {!c.is_active && <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">ปิดใช้</span>}
                            </div>
                            {plat && <p className="text-xs text-gray-400 mt-0.5">🛍️ {plat.name}</p>}
                            <p className="text-xs text-gray-400">
                              {DISCOUNT_TYPES.find(d => d.value === c.discount_type)?.label} · ลด {c.discount_value}
                              {c.discount_type.includes('percent') ? '%' : '฿'}
                              {c.max_discount ? ` (max ${c.max_discount}฿)` : ''}
                            </p>
                            <p className="text-xs text-gray-400">
                              ค่ากด: {c.service_fee_formula === 'fixed' ? `${c.service_fee}฿` : c.service_fee_formula === 'half' ? 'ครึ่งส่วนลด' : 'กรอกเอง'}
                              {c.min_purchase > 0 ? ` · ขั้นต่ำ ${c.min_purchase}%` : ''}
                            </p>
                          </div>
                          <div className="flex gap-1.5 ml-2 flex-shrink-0">
                            <button onClick={() => toggleCouponActive(c)}
                              className={`text-xs px-2 py-1.5 rounded-xl active:scale-95 ${c.is_active ? 'bg-teal-50 text-teal-500' : 'bg-gray-200 text-gray-500'}`}>
                              {c.is_active ? '✅' : '⏸️'}
                            </button>
                            <button onClick={() => openEditCoupon(c)} className="text-blue-400 text-sm active:scale-95 px-1">✏️</button>
                            <button onClick={() => handleDeleteCoupon(c.id, c.name)} className="text-red-300 text-sm active:scale-95 px-1">🗑️</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* เพิ่มรายการใหม่ */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="text-xs text-gray-500 font-bold mb-2 block">เพิ่มรายการใหม่</label>
              <div className="flex gap-2">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !isDebtCategories && handleAdd()}
                  className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none"
                  placeholder={`ชื่อ${currentTab.label.replace(/^[^\s]+\s/, '')}...`} />
                {!isDebtCategories && (
                  <button onClick={handleAdd} disabled={!newName.trim()}
                    className="bg-gradient-to-r from-orange-400 to-rose-400 text-white px-4 rounded-xl text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform">
                    + เพิ่ม
                  </button>
                )}
              </div>
              {isDebtCategories && (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-xs text-gray-500">ครบกำหนดทุกวันที่</label>
                      <input type="number" value={newDueDay} onChange={e => setNewDueDay(e.target.value)}
                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none mt-1" placeholder="เช่น 10" min="1" max="31" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">รอบบิลเริ่มวันที่</label>
                      <input type="number" value={newBillingStartDay} onChange={e => setNewBillingStartDay(e.target.value)}
                        className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none mt-1" placeholder="เช่น 1" min="1" max="31" />
                    </div>
                  </div>
                  <button onClick={handleAdd} disabled={!newName.trim()}
                    className="w-full bg-gradient-to-r from-orange-400 to-rose-400 text-white py-2.5 rounded-xl text-sm font-semibold mt-2 disabled:opacity-50">
                    + เพิ่ม
                  </button>
                </>
              )}
            </div>

            {/* รายการ */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-700">{currentTab.label}</h3>
                {isSortable && <p className="text-xs text-gray-400">{saving ? '💾 กำลังบันทึก...' : '☰ ลากเพื่อเรียงลำดับค่ะ'}</p>}
              </div>

              {isSortable && !isDebtCategories && (
                items.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีรายการค่ะ</p> : (
                  <div className="space-y-2">
                    {items.map((item, index) => (
                      <div key={item.id}
                        draggable={editingId !== item.id}
                        onDragStart={() => handleDragStart(index)}
                        onDragEnter={() => handleDragEnter(index)}
                        onDragEnd={handleDragEnd}
                        onDrop={handleDrop}
                        onDragOver={e => e.preventDefault()}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all cursor-grab active:cursor-grabbing select-none ${
                          dragIndex === index ? 'opacity-40 bg-orange-50 scale-95' :
                          dropIndex === index && dragIndex !== index ? 'bg-orange-100 ring-2 ring-orange-300' : 'bg-gray-50'
                        }`}>
                        <div className="flex flex-col gap-0.5 flex-shrink-0 text-gray-300">
                          {[0,1,2].map(r => (
                            <div key={r} className="flex gap-0.5">
                              <div className="w-1 h-1 bg-current rounded-full" />
                              <div className="w-1 h-1 bg-current rounded-full" />
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-gray-400 font-bold w-4 text-center flex-shrink-0">{index + 1}</span>
                        {editingId === item.id ? (
                          <>
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleEdit(item.id)}
                              autoFocus className="flex-1 bg-white rounded-xl px-3 py-1.5 text-sm outline-none shadow-sm"
                              onClick={e => e.stopPropagation()} />
                            <button onClick={() => handleEdit(item.id)} className="text-teal-500 text-sm font-bold active:scale-95">✓</button>
                            <button onClick={() => { setEditingId(null); setEditName('') }} className="text-gray-400 text-sm active:scale-95">✕</button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-medium text-gray-800">{item.name}</span>
                            <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); startEdit(item) }} className="text-blue-400 text-sm active:scale-95">✏️</button>
                            <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); handleDelete(item.id, item.name) }} className="text-red-300 text-sm active:scale-95">🗑️</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {!isSortable && !isDebtCategories && (
                items.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีรายการค่ะ</p> : (
                  <div className="space-y-2">
                    {items.map(item => (
                      <div key={item.id} className="flex justify-between items-center py-2.5 px-3 bg-gray-50 rounded-xl">
                        {editingId === item.id ? (
                          <>
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleEdit(item.id)}
                              autoFocus className="flex-1 bg-white rounded-xl px-3 py-1.5 text-sm outline-none shadow-sm mr-2" />
                            <button onClick={() => handleEdit(item.id)} className="text-teal-500 text-sm font-bold mr-2 active:scale-95">✓</button>
                            <button onClick={() => { setEditingId(null); setEditName('') }} className="text-gray-400 text-sm active:scale-95">✕</button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm font-medium text-gray-800">{item.name}</span>
                            <div className="flex gap-2">
                              <button onClick={() => startEdit(item)} className="text-blue-400 text-sm active:scale-95">✏️</button>
                              <button onClick={() => handleDelete(item.id, item.name)} className="text-red-300 text-sm active:scale-95">🗑️</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {isDebtCategories && (
                debtCategories.length === 0 ? <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีรายการค่ะ</p> : (
                  <div className="space-y-2">
                    {debtCategories.map(item => (
                      <div key={item.id} className="py-2 border-b border-gray-100 last:border-0">
                        {editingId === item.id ? (
                          <div className="space-y-2">
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              autoFocus className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none" />
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-gray-400">ครบกำหนดวันที่</label>
                                <input type="number" value={editDueDay} onChange={e => setEditDueDay(e.target.value)}
                                  className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none mt-1" placeholder="เช่น 10" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400">รอบบิลเริ่มวันที่</label>
                                <input type="number" value={editBillingStartDay} onChange={e => setEditBillingStartDay(e.target.value)}
                                  className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none mt-1" placeholder="เช่น 1" />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleEdit(item.id)} className="flex-1 bg-teal-500 text-white py-2 rounded-xl text-sm font-semibold">✓ บันทึก</button>
                              <button onClick={() => { setEditingId(null); setEditName('') }} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm">ยกเลิก</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-sm font-medium text-gray-800">{item.name}</div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {item.due_day ? `ครบกำหนดวันที่ ${item.due_day}` : 'ไม่ระบุวันครบกำหนด'}
                                {item.billing_start_day ? ` · รอบบิลเริ่มวันที่ ${item.billing_start_day}` : ''}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => startEdit(item)} className="text-blue-500 text-sm active:scale-95">✏️</button>
                              <button onClick={() => handleDelete(item.id, item.name)} className="text-red-400 text-sm active:scale-95">🗑️</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ Coupon Form Modal ══ */}
      {showCouponForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">{editingCouponId ? '✏️ แก้ไขคูปอง' : '+ เพิ่มคูปอง'}</h3>
              <button onClick={() => setShowCouponForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">ชื่อคูปอง *</label>
                <input value={couponForm.name} onChange={e => setCouponForm({ ...couponForm, name: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm"
                  placeholder="เช่น TikTok 180, Shopee 50%" />
              </div>

              <div>
                <label className="text-xs text-gray-500">แพลตฟอร์ม</label>
                <select value={couponForm.platform_id} onChange={e => setCouponForm({ ...couponForm, platform_id: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm">
                  <option value="">ไม่ระบุ</option>
                  {platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500">ประเภทส่วนลด</label>
                <select value={couponForm.discount_type} onChange={e => setCouponForm({ ...couponForm, discount_type: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm">
                  {DISCOUNT_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">
                    {couponForm.discount_type.includes('percent') ? 'ลด (%)' : 'ลด (฿)'}
                  </label>
                  <input type="number" value={couponForm.discount_value}
                    onChange={e => setCouponForm({ ...couponForm, discount_value: Number(e.target.value) })}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">
                    {couponForm.discount_type === 'percent_cap' ? 'ลดสูงสุด (฿)' : 'แสดงผลเป็น (฿)'}
                  </label>
                  <input type="number" value={couponForm.discount_type === 'percent_cap' ? couponForm.max_discount : couponForm.display_value}
                    onChange={e => couponForm.discount_type === 'percent_cap'
                      ? setCouponForm({ ...couponForm, max_discount: e.target.value })
                      : setCouponForm({ ...couponForm, display_value: e.target.value })}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm"
                    placeholder="ไม่ระบุ" />
                </div>
              </div>

              {(couponForm.discount_type === 'flat' || couponForm.discount_type === 'percent') && (
                <div>
                  <label className="text-xs text-gray-500">ขั้นต่ำที่ต้องจ่าย (%) เช่น 1 = จ่ายอย่างน้อย 1%</label>
                  <input type="number" value={couponForm.min_purchase}
                    onChange={e => setCouponForm({ ...couponForm, min_purchase: Number(e.target.value) })}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm"
                    placeholder="0 = ไม่มีขั้นต่ำ" min="0" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">สูตรค่ากด</label>
                  <select value={couponForm.service_fee_formula} onChange={e => setCouponForm({ ...couponForm, service_fee_formula: e.target.value })}
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm">
                    {FEE_FORMULAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                {couponForm.service_fee_formula === 'fixed' && (
                  <div>
                    <label className="text-xs text-gray-500">ค่ากด (฿)</label>
                    <input type="number" value={couponForm.service_fee}
                      onChange={e => setCouponForm({ ...couponForm, service_fee: Number(e.target.value) })}
                      className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 shadow-sm">
                <span className="text-sm text-gray-600 flex-1">เปิดใช้งาน</span>
                <button onClick={() => setCouponForm({ ...couponForm, is_active: !couponForm.is_active })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${couponForm.is_active ? 'bg-teal-400' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${couponForm.is_active ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            <button onClick={handleSaveCoupon} disabled={saving || !couponForm.name.trim()}
              className="w-full bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95">
              {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
            </button>
          </div>
        </div>
      )}

    </main>
  )
}