'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Item = { id: string; name: string; sort_order?: number }
type DebtCategory = { id: string; name: string; due_day: number | null; billing_start_day: number | null }

const TABS = [
  { key: 'categories', label: '📦 หมวดหมู่สินค้า', table: 'categories', sortable: true },
  { key: 'zones', label: '📍 โซนส่งของ', table: 'zones', sortable: true },
  { key: 'platforms', label: '🛍️ แพลตฟอร์ม', table: 'platforms', sortable: false },
  { key: 'operators', label: '👤 คนกด', table: 'operators', sortable: false },
  { key: 'debt_categories', label: '💳 หมวดหมู่หนี้สิน', table: 'debt_categories', sortable: false },
]

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('categories')
  const [items, setItems] = useState<Item[]>([])
  const [debtCategories, setDebtCategories] = useState<DebtCategory[]>([])
  const [newName, setNewName] = useState('')
  const [newDueDay, setNewDueDay] = useState('')
  const [newBillingStartDay, setNewBillingStartDay] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDueDay, setEditDueDay] = useState('')
  const [editBillingStartDay, setEditBillingStartDay] = useState('')

  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const currentTab = TABS.find(t => t.key === activeTab)!
  const isDebtCategories = activeTab === 'debt_categories'
  const isSortable = currentTab.sortable

  useEffect(() => { fetchItems() }, [activeTab])

  async function fetchItems() {
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

  function handleDragStart(index: number) {
    dragItem.current = index
    setDragIndex(index)
  }

  function handleDragEnter(index: number) {
    dragOverItem.current = index
    setDropIndex(index)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  async function handleDrop() {
    if (dragItem.current === null || dragOverItem.current === null) return
    if (dragItem.current === dragOverItem.current) {
      setDragIndex(null); setDropIndex(null)
      dragItem.current = null; dragOverItem.current = null
      return
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

          {/* Drag & Drop (sortable) */}
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
                    {/* drag handle */}
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

          {/* รายการทั่วไป */}
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

          {/* หมวดหมู่หนี้สิน */}
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
      </div>
    </main>
  )
}