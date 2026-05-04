'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Item = { id: string; name: string }

const TABS = [
  { key: 'categories', label: '📦 หมวดหมู่สินค้า', table: 'categories' },
  { key: 'platforms', label: '🛍️ แพลตฟอร์ม', table: 'platforms' },
  { key: 'operators', label: '👤 คนกด', table: 'operators' },
  { key: 'zones', label: '📍 โซนส่งของ', table: 'zones' },
]

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('categories')
  const [items, setItems] = useState<Item[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const currentTab = TABS.find(t => t.key === activeTab)!

  useEffect(() => { fetchItems() }, [activeTab])

  async function fetchItems() {
    const { data } = await supabase.from(currentTab.table).select('*').order('name')
    setItems(data || [])
  }

  async function handleAdd() {
    if (!newName.trim()) return
    await supabase.from(currentTab.table).insert({ name: newName.trim() })
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
    await supabase.from(currentTab.table).update({ name: editName.trim() }).eq('id', id)
    setEditingId(null)
    setEditName('')
    fetchItems()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">⚙️ ตั้งค่า</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 rounded-xl text-sm whitespace-nowrap font-medium ${
                activeTab === tab.key
                  ? 'bg-gray-800 text-white'
                  : 'bg-white text-gray-600'
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
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="flex-1 border border-gray-200 rounded-xl p-2 text-sm"
              placeholder={`เพิ่ม${currentTab.label.replace(/^[^\s]+\s/, '')}...`} />
            <button onClick={handleAdd} disabled={!newName.trim()}
              className="bg-gray-800 text-white px-4 rounded-xl text-sm disabled:opacity-50">
              + เพิ่ม
            </button>
          </div>
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-gray-700 mb-3">{currentTab.label}</h3>
          {items.length === 0 ? (
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
                      <button onClick={() => handleEdit(item.id)}
                        className="text-green-500 text-sm mr-2">✓</button>
                      <button onClick={() => { setEditingId(null); setEditName('') }}
                        className="text-gray-400 text-sm">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-gray-800">{item.name}</span>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingId(item.id); setEditName(item.name) }}
                          className="text-blue-500 text-sm">✏️</button>
                        <button onClick={() => handleDelete(item.id, item.name)}
                          className="text-red-400 text-sm">🗑️</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}