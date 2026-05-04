'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Item = { id: string; name: string }
type DebtCategory = { id: string; name: string; due_day: number | null; billing_start_day: number | null }

const TABS = [
  { key: 'categories', label: '📦 หมวดหมู่สินค้า', table: 'categories' },
  { key: 'platforms', label: '🛍️ แพลตฟอร์ม', table: 'platforms' },
  { key: 'operators', label: '👤 คนกด', table: 'operators' },
  { key: 'zones', label: '📍 โซนส่งของ', table: 'zones' },
  { key: 'debt_categories', label: '💳 หมวดหมู่หนี้สิน', table: 'debt_categories' },
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

  const currentTab = TABS.find(t => t.key === activeTab)!
  const isDebtCategories = activeTab === 'debt_categories'

  useEffect(() => { fetchItems() }, [activeTab])

  async function fetchItems() {
    const { data } = await supabase.from(currentTab.table).select('*').order('name')
    if (isDebtCategories) {
      setDebtCategories((data || []) as DebtCategory[])
    } else {
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
      setNewDueDay('')
      setNewBillingStartDay('')
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
    setEditingId(null)
    setEditName('')
    setEditDueDay('')
    setEditBillingStartDay('')
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

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">⚙️ ตั้งค่า</h1>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 rounded-xl text-sm whitespace-nowrap font-medium ${
                activeTab === tab.key ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Add new */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <label className="text-xs text-gray-500">เพิ่มรายการใหม่</label>
          <div className="flex gap-2 mt-1">
            <input value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isDebtCategories && handleAdd()}
              className="flex-1 border border-gray-200 rounded-xl p-2 text-sm"
              placeholder={`เพิ่ม${currentTab.label.replace(/^[^\s]+\s/, '')}...`} />
            {!isDebtCategories && (
              <button onClick={handleAdd} disabled={!newName.trim()}
                className="bg-gray-800 text-white px-4 rounded-xl text-sm disabled:opacity-50">
                + เพิ่ม
              </button>
            )}
          </div>

          {isDebtCategories && (
            <>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="text-xs text-gray-500">ครบกำหนดทุกวันที่</label>
                  <input type="number" value={newDueDay}
                    onChange={e => setNewDueDay(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="เช่น 10" min="1" max="31" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">รอบบิลเริ่มวันที่</label>
                  <input type="number" value={newBillingStartDay}
                    onChange={e => setNewBillingStartDay(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="เช่น 1" min="1" max="31" />
                </div>
              </div>
              <button onClick={handleAdd} disabled={!newName.trim()}
                className="w-full bg-gray-800 text-white py-2 rounded-xl text-sm mt-2 disabled:opacity-50">
                + เพิ่ม
              </button>
            </>
          )}
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-gray-700 mb-3">{currentTab.label}</h3>

          {isDebtCategories ? (
            debtCategories.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีรายการค่ะ</p>
            ) : (
              <div className="space-y-2">
                {debtCategories.map(item => (
                  <div key={item.id} className="py-2 border-b border-gray-100 last:border-0">
                    {editingId === item.id ? (
                      <div className="space-y-2">
                        <input value={editName} onChange={e => setEditName(e.target.value)}
                          autoFocus
                          className="w-full border border-gray-200 rounded-lg p-1.5 text-sm" />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-400">ครบกำหนดวันที่</label>
                            <input type="number" value={editDueDay}
                              onChange={e => setEditDueDay(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg p-1.5 text-sm mt-1"
                              placeholder="เช่น 10" min="1" max="31" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400">รอบบิลเริ่มวันที่</label>
                            <input type="number" value={editBillingStartDay}
                              onChange={e => setEditBillingStartDay(e.target.value)}
                              className="w-full border border-gray-200 rounded-lg p-1.5 text-sm mt-1"
                              placeholder="เช่น 1" min="1" max="31" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleEdit(item.id)}
                            className="flex-1 bg-green-500 text-white py-1.5 rounded-lg text-sm">✓ บันทึก</button>
                          <button onClick={() => { setEditingId(null); setEditName('') }}
                            className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm">ยกเลิก</button>
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
                          <button onClick={() => startEdit(item)} className="text-blue-500 text-sm">✏️</button>
                          <button onClick={() => handleDelete(item.id, item.name)} className="text-red-400 text-sm">🗑️</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            items.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีรายการค่ะ</p>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id}
                    className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    {editingId === item.id ? (
                      <>
                        <input value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleEdit(item.id)}
                          autoFocus
                          className="flex-1 border border-gray-200 rounded-lg p-1 text-sm mr-2" />
                        <button onClick={() => handleEdit(item.id)} className="text-green-500 text-sm mr-2">✓</button>
                        <button onClick={() => { setEditingId(null); setEditName('') }} className="text-gray-400 text-sm">✕</button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-gray-800">{item.name}</span>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(item)} className="text-blue-500 text-sm">✏️</button>
                          <button onClick={() => handleDelete(item.id, item.name)} className="text-red-400 text-sm">🗑️</button>
                        </div>
                      </>
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