'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Product = { id: string; name: string; stock_qty: number; unit: string }

type PurchaseItem = {
  id: string
  group_id: string
  product_id: string | null
  product_name: string
  short_name: string | null
  units_per_order: number
  order_qty: number
  ordered_qty: number
  note: string | null
  products?: { stock_qty: number; unit: string } | null
}

type PurchaseGroup = {
  id: string
  name: string
  sort_order: number
  items: PurchaseItem[]
}

type PurchaseLog = {
  id: string
  group_name: string
  product_name: string
  short_name: string | null
  ordered_qty: number
  units_per_order: number
  logged_at: string
}

type OrderEntry = {
  itemId: string
  groupName: string
  name: string
  qty: number
  unitsPerOrder: number
}

export default function PurchasePage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'order' | 'stats'>('order')
  const [groups, setGroups] = useState<PurchaseGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [logs, setLogs] = useState<PurchaseLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [orderEntries, setOrderEntries] = useState<OrderEntry[]>([])
  const [showOrderSession, setShowOrderSession] = useState(false)
  const [copied, setCopied] = useState(false)

  // ✅ ย่อ/ขยายกรุ๊ป
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const [showAddItem, setShowAddItem] = useState(false)
  const [addingGroupId, setAddingGroupId] = useState('')
  const [itemMode, setItemMode] = useState<'product' | 'custom'>('product')
  const [itemProductId, setItemProductId] = useState('')
  const [itemProductSearch, setItemProductSearch] = useState('')
  const [itemCustomName, setItemCustomName] = useState('')
  const [itemShortName, setItemShortName] = useState('')
  const [itemUnitsPerOrder, setItemUnitsPerOrder] = useState(12)
  const [itemOrderQty, setItemOrderQty] = useState(1)
  const [itemNote, setItemNote] = useState('')

  const [editingItem, setEditingItem] = useState<PurchaseItem | null>(null)
  const [showEditItem, setShowEditItem] = useState(false)

  const [statsMonth, setStatsMonth] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: g }, { data: items }, { data: p }, { data: l }] = await Promise.all([
      supabase.from('purchase_groups').select('*').order('sort_order', { ascending: true }),
      supabase.from('purchase_items').select('*, products(stock_qty, unit)').order('created_at', { ascending: true }),
      supabase.from('products').select('id, name, stock_qty, unit').eq('is_active', true).order('name'),
      supabase.from('purchase_logs').select('*').order('logged_at', { ascending: false }).limit(300),
    ])
    setGroups((g || []).map(group => ({ ...group, items: (items || []).filter(i => i.group_id === group.id) })))
    setProducts(p || [])
    setLogs(l || [])
    setLoading(false)
  }

  // ── ย่อ/ขยาย ──
  function toggleCollapse(groupId: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })
  }

  // ── เลือกทั้งกรุ๊ป ──
  function toggleSelectAll(group: PurchaseGroup) {
    const allSelected = group.items.every(i => orderEntries.find(e => e.itemId === i.id))
    if (allSelected) {
      setOrderEntries(prev => prev.filter(e => !group.items.find(i => i.id === e.itemId)))
    } else {
      const toAdd = group.items
        .filter(i => !orderEntries.find(e => e.itemId === i.id))
        .map(i => ({
          itemId: i.id,
          groupName: group.name,
          name: i.short_name?.trim() || i.product_name,
          qty: i.order_qty,
          unitsPerOrder: i.units_per_order,
        }))
      setOrderEntries(prev => [...prev, ...toAdd])
    }
  }

  // ── toggle item ──
  function toggleItemInOrder(item: PurchaseItem, groupName: string) {
    const exists = orderEntries.find(e => e.itemId === item.id)
    if (exists) {
      setOrderEntries(prev => prev.filter(e => e.itemId !== item.id))
    } else {
      setOrderEntries(prev => [...prev, {
        itemId: item.id,
        groupName,
        name: item.short_name?.trim() || item.product_name,
        qty: item.order_qty,
        unitsPerOrder: item.units_per_order,
      }])
    }
  }

  function updateEntryQty(itemId: string, qty: number) {
    setOrderEntries(prev => prev.map(e => e.itemId === itemId ? { ...e, qty: Math.max(0, qty) } : e))
  }

  function generateCopyText() {
    const valid = orderEntries.filter(e => e.qty > 0)
    if (valid.length === 0) return ''
    const byGroup: { [g: string]: OrderEntry[] } = {}
    valid.forEach(e => {
      if (!byGroup[e.groupName]) byGroup[e.groupName] = []
      byGroup[e.groupName].push(e)
    })
    let text = ''
    Object.entries(byGroup).forEach(([g, entries]) => {
      const total = entries.reduce((s, e) => s + e.qty, 0)
      text += `${g}\n`
      entries.forEach(e => { text += `${e.name} ${e.qty} ออเดอร์\n` })
      text += `รวม ${total} ออเดอร์\n\n`
    })
    const grand = valid.reduce((s, e) => s + e.qty, 0)
    if (Object.keys(byGroup).length > 1) text += `รวมทั้งหมด ${grand} ออเดอร์`
    return text.trim()
  }

  async function handleSaveStats() {
    const valid = orderEntries.filter(e => e.qty > 0)
    if (valid.length === 0) { alert('ยังไม่มีรายการค่ะ'); return }
    if (!confirm(`บันทึกสถิติ ${valid.length} รายการ?`)) return
    setSaving(true)
    await supabase.from('purchase_logs').insert(valid.map(e => ({
      group_name: e.groupName,
      product_name: e.name,
      short_name: null,
      ordered_qty: e.qty,
      units_per_order: e.unitsPerOrder,
    })))
    setOrderEntries([])
    setShowOrderSession(false)
    fetchData()
    setSaving(false)
    alert('บันทึกสถิติเรียบร้อยค่ะ ✅')
  }

  // ✅ ลบ log รายการเดียว
  async function handleDeleteLog(id: string) {
    if (!confirm('ลบรายการนี้ออกจากสถิติ?')) return
    await supabase.from('purchase_logs').delete().eq('id', id)
    fetchData()
  }

  // ✅ ลบ log ทั้งเดือน
  async function handleDeleteMonthLogs() {
    if (!confirm(`ลบสถิติทั้งหมดของเดือน ${statsMonth}?`)) return
    const ids = filteredLogs.map(l => l.id)
    if (ids.length === 0) return
    await supabase.from('purchase_logs').delete().in('id', ids)
    fetchData()
  }

  async function handleAddGroup() {
    if (!newGroupName.trim()) return
    setSaving(true)
    const maxOrder = groups.length > 0 ? Math.max(...groups.map(g => g.sort_order || 0)) : 0
    await supabase.from('purchase_groups').insert({ name: newGroupName.trim(), sort_order: maxOrder + 1 })
    setNewGroupName(''); setShowAddGroup(false); fetchData(); setSaving(false)
  }

  async function handleDeleteGroup(id: string, name: string) {
    if (!confirm(`ลบกรุ๊ป "${name}"?`)) return
    await supabase.from('purchase_groups').delete().eq('id', id)
    fetchData()
  }

  function openAddItem(groupId: string) {
    setAddingGroupId(groupId)
    setItemMode('product'); setItemProductId(''); setItemProductSearch('')
    setItemCustomName(''); setItemShortName(''); setItemUnitsPerOrder(12)
    setItemOrderQty(1); setItemNote(''); setShowAddItem(true)
  }

  async function handleAddItem() {
    if (itemMode === 'product' && !itemProductId) { alert('กรุณาเลือกสินค้าค่ะ'); return }
    if (itemMode === 'custom' && !itemCustomName.trim()) { alert('กรุณากรอกชื่อสินค้าค่ะ'); return }
    setSaving(true)
    const product = itemMode === 'product' ? products.find(p => p.id === itemProductId) : null
    await supabase.from('purchase_items').insert({
      group_id: addingGroupId,
      product_id: itemMode === 'product' ? itemProductId : null,
      product_name: itemMode === 'product' ? (product?.name || '') : itemCustomName.trim(),
      short_name: itemShortName.trim() || null,
      units_per_order: itemUnitsPerOrder,
      order_qty: itemOrderQty,
      ordered_qty: 0,
      note: itemNote || null,
    })
    setShowAddItem(false); fetchData(); setSaving(false)
  }

  async function handleDeleteItem(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    await supabase.from('purchase_items').delete().eq('id', id)
    fetchData()
  }

  async function handleSaveEdit() {
    if (!editingItem) return
    setSaving(true)
    await supabase.from('purchase_items').update({
      product_name: editingItem.product_name,
      short_name: editingItem.short_name?.trim() || null,
      units_per_order: editingItem.units_per_order,
      order_qty: editingItem.order_qty,
      note: editingItem.note || null,
    }).eq('id', editingItem.id)
    setShowEditItem(false); setEditingItem(null); fetchData(); setSaving(false)
  }

  // stats
  const filteredLogs = logs.filter(l => l.logged_at.startsWith(statsMonth))
  const statsMap: { [key: string]: { product_name: string; group_name: string; total_orders: number; rounds: number; logIds: string[] } } = {}
  filteredLogs.forEach(l => {
    const key = `${l.group_name}__${l.product_name}`
    if (!statsMap[key]) statsMap[key] = { product_name: l.product_name, group_name: l.group_name, total_orders: 0, rounds: 0, logIds: [] }
    statsMap[key].total_orders += l.ordered_qty
    statsMap[key].rounds++
    statsMap[key].logIds.push(l.id)
  })
  const statsData = Object.values(statsMap).sort((a, b) => b.total_orders - a.total_orders)
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(itemProductSearch.toLowerCase()))
  const selectedCount = orderEntries.length

  return (
    <main className="min-h-screen bg-[#fff5f3]">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')}
              className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95">←</button>
            <h1 className="text-lg font-bold text-gray-800">📋 รายการสั่งซื้อ</h1>
          </div>
          {activeTab === 'order' && (
            <div className="flex gap-2">
              {selectedCount > 0 && (
                <button onClick={() => setShowOrderSession(true)}
                  className="relative bg-gradient-to-r from-orange-400 to-rose-400 text-white text-xs px-3 py-2 rounded-xl font-semibold active:scale-95">
                  📋 กรอกจำนวน
                  <span className="absolute -top-1 -right-1 bg-white text-orange-500 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {selectedCount}
                  </span>
                </button>
              )}
              <button onClick={() => setShowAddGroup(true)}
                className="bg-white text-gray-600 text-xs px-3 py-2 rounded-xl font-semibold shadow-sm active:scale-95">
                + กรุ๊ป
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setActiveTab('order')}
            className={`py-2.5 rounded-2xl text-sm font-bold transition-all ${activeTab === 'order' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
            📋 รายการสั่ง
          </button>
          <button onClick={() => setActiveTab('stats')}
            className={`py-2.5 rounded-2xl text-sm font-bold transition-all ${activeTab === 'stats' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
            📊 สถิติ
          </button>
        </div>
      </div>

      <div className="px-4 pb-8 pt-2 space-y-3">

        {/* ══ TAB: รายการสั่ง ══ */}
        {activeTab === 'order' && (
          <>
            <div className="bg-orange-50 rounded-2xl p-3">
              <p className="text-xs text-orange-700 font-bold">วิธีใช้ค่ะ</p>
              <p className="text-xs text-orange-500 mt-0.5">กดติ๊ก ☐ รายการที่จะสั่ง (หรือติ๊กหน้ากรุ๊ปเพื่อเลือกทั้งหมด) → กด "กรอกจำนวน" → คัดลอก → บันทึกสถิติค่ะ</p>
            </div>

            {loading ? (
              <p className="text-center text-gray-400 py-12 text-sm">กำลังโหลด...</p>
            ) : groups.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-5xl mb-3">📋</div>
                <p className="text-sm">ยังไม่มีรายการค่ะ กด "+ กรุ๊ป" ได้เลยค่ะ</p>
              </div>
            ) : groups.map(group => {
              const isCollapsed = collapsedGroups.has(group.id)
              const allSelected = group.items.length > 0 && group.items.every(i => orderEntries.find(e => e.itemId === i.id))
              const someSelected = group.items.some(i => orderEntries.find(e => e.itemId === i.id))
              const selectedInGroup = group.items.filter(i => orderEntries.find(e => e.itemId === i.id)).length

              return (
                <div key={group.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">

                  {/* ✅ Group Header */}
                  <div className="bg-gray-50 px-4 py-3 flex items-center gap-3">
                    {/* checkbox เลือกทั้งกรุ๊ป */}
                    <div
                      onClick={() => toggleSelectAll(group)}
                      className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                        allSelected ? 'bg-orange-400 border-orange-400' :
                        someSelected ? 'bg-orange-200 border-orange-300' :
                        'border-gray-300 bg-white'
                      }`}>
                      {allSelected && <span className="text-white text-xs font-bold">✓</span>}
                      {someSelected && !allSelected && <span className="text-orange-500 text-xs font-bold">−</span>}
                    </div>

                    {/* ชื่อกรุ๊ป + badge กดเพื่อ collapse */}
                    <div className="flex-1 flex items-center gap-2 cursor-pointer" onClick={() => toggleCollapse(group.id)}>
                      <span className="font-bold text-gray-800">{group.name}</span>
                      {someSelected && (
                        <span className="text-xs bg-orange-100 text-orange-500 px-1.5 py-0.5 rounded-full font-semibold">
                          {selectedInGroup}/{group.items.length}
                        </span>
                      )}
                    </div>

                    {/* ปุ่มย่อ/ขยาย + ลบ */}
                    <div className="flex gap-1.5 items-center flex-shrink-0">
                      <button onClick={() => toggleCollapse(group.id)}
                        className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center text-gray-400 font-bold text-sm active:scale-95">
                        {isCollapsed ? '▼' : '▲'}
                      </button>
                      <button onClick={() => handleDeleteGroup(group.id, group.name)}
                        className="w-8 h-8 bg-white rounded-xl shadow-sm flex items-center justify-center text-red-300 active:scale-95">🗑️</button>
                    </div>
                  </div>

                  {/* ✅ Items — ซ่อนถ้า collapsed */}
                  {!isCollapsed && (
                    <>
                      <div className="divide-y divide-gray-50">
                        {group.items.length === 0 ? (
                          <p className="text-xs text-gray-300 text-center py-4">ยังไม่มีสินค้าค่ะ</p>
                        ) : group.items.map(item => {
                          const isSelected = !!orderEntries.find(e => e.itemId === item.id)
                          const currentStock = item.products?.stock_qty ?? null
                          return (
                            <div key={item.id}
                              onClick={() => toggleItemInOrder(item, group.name)}
                              className={`px-4 py-3 cursor-pointer active:scale-[0.99] transition-all ${isSelected ? 'bg-orange-50' : ''}`}>
                              <div className="flex items-start gap-3">
                                <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${isSelected ? 'bg-orange-400 border-orange-400' : 'border-gray-300'}`}>
                                  {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800">{item.product_name}</span>
                                    {item.short_name && (
                                      <span className="text-xs bg-orange-50 text-orange-400 px-1.5 py-0.5 rounded-full">📋 {item.short_name}</span>
                                    )}
                                  </div>
                                  {currentStock !== null && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      stock: <span className={`font-semibold ${currentStock <= 5 ? 'text-red-400' : 'text-gray-600'}`}>{currentStock} {item.products?.unit || 'ชิ้น'}</span>
                                      {' · '}ปกติสั่ง {item.order_qty} ออเดอร์
                                    </p>
                                  )}
                                  {item.note && <p className="text-xs text-amber-500 mt-0.5">📝 {item.note}</p>}
                                </div>
                                <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { setEditingItem({ ...item }); setShowEditItem(true) }}
                                    className="w-7 h-7 bg-gray-50 rounded-lg text-blue-400 flex items-center justify-center text-xs active:scale-95">✏️</button>
                                  <button onClick={() => handleDeleteItem(item.id)}
                                    className="w-7 h-7 bg-gray-50 rounded-lg text-red-300 flex items-center justify-center text-xs active:scale-95">🗑️</button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="px-4 py-2.5 border-t border-gray-50">
                        <button onClick={() => openAddItem(group.id)}
                          className="w-full bg-gray-50 text-gray-400 text-sm py-2 rounded-xl active:scale-95 font-medium">
                          + เพิ่มสินค้าในกรุ๊ปนี้
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ══ TAB: สถิติ ══ */}
        {activeTab === 'stats' && (
          <>
            <div className="bg-white rounded-2xl p-3 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">เลือกเดือน</label>
                {filteredLogs.length > 0 && (
                  <button onClick={handleDeleteMonthLogs}
                    className="text-xs text-red-400 bg-red-50 px-2.5 py-1 rounded-xl active:scale-95 font-semibold">
                    🗑️ ลบทั้งเดือน
                  </button>
                )}
              </div>
              <input type="month" value={statsMonth} onChange={e => setStatsMonth(e.target.value)}
                className="w-full bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none mt-1" />
            </div>

            {statsData.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">📊</div>
                <p className="text-sm">ยังไม่มีข้อมูลเดือนนี้ค่ะ</p>
                <p className="text-xs text-gray-300 mt-1">กรอกจำนวนแล้วกด "บันทึกสถิติ" ค่ะ</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
                    <p className="text-xs text-gray-400">รายการทั้งหมด</p>
                    <p className="text-2xl font-bold text-orange-500">{statsData.length}</p>
                  </div>
                  <div className="bg-white rounded-2xl p-3 shadow-sm text-center">
                    <p className="text-xs text-gray-400">รวมออเดอร์</p>
                    <p className="text-2xl font-bold text-rose-500">{statsData.reduce((s, d) => s + d.total_orders, 0)}</p>
                  </div>
                </div>

                {/* ✅ แสดง log รายวัน พร้อมปุ่มลบ */}
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5">
                    <p className="font-bold text-gray-700 text-sm">📋 รายการทั้งหมด</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {filteredLogs.map(log => (
                      <div key={log.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{log.product_name}</p>
                          <p className="text-xs text-gray-400">
                            {log.group_name} · {new Date(log.logged_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-orange-500">{log.ordered_qty} ออเดอร์</span>
                          <button onClick={() => handleDeleteLog(log.id)}
                            className="w-7 h-7 bg-red-50 rounded-lg text-red-300 flex items-center justify-center text-xs active:scale-95">🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* สรุปรายสินค้า */}
                <p className="font-bold text-gray-700 text-sm px-1">📊 สรุปรายสินค้า</p>
                {Array.from(new Set(statsData.map(d => d.group_name))).map(groupName => {
                  const groupStats = statsData.filter(d => d.group_name === groupName)
                  const groupTotal = groupStats.reduce((s, d) => s + d.total_orders, 0)
                  return (
                    <div key={groupName} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2.5 flex justify-between items-center">
                        <span className="font-bold text-gray-700 text-sm">📦 {groupName}</span>
                        <span className="text-xs text-amber-500 font-semibold">รวม {groupTotal} ออเดอร์</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {groupStats.map((d, i) => (
                          <div key={i} className="px-4 py-3 flex justify-between items-center">
                            <p className="text-sm font-medium text-gray-800">{d.product_name}</p>
                            <div className="text-right">
                              <p className="text-sm font-bold text-orange-500">{d.total_orders} ออเดอร์</p>
                              <p className="text-xs text-gray-400">{d.rounds} รอบ</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>

      {/* ══ Add Group Modal ══ */}
      {showAddGroup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <h3 className="font-bold text-lg text-gray-800 mb-4">+ เพิ่มกรุ๊ป</h3>
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
              autoFocus placeholder="เช่น Pramy, Buzz Beyond..."
              className="w-full bg-white rounded-xl px-4 py-3 text-sm outline-none shadow-sm mb-3" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowAddGroup(false)} className="bg-white text-gray-500 py-3 rounded-2xl font-semibold text-sm shadow-sm">ยกเลิก</button>
              <button onClick={handleAddGroup} disabled={!newGroupName.trim() || saving}
                className="bg-gradient-to-r from-orange-400 to-rose-400 text-white py-3 rounded-2xl font-bold text-sm disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ เพิ่ม'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Add Item Modal ══ */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">+ เพิ่มสินค้า</h3>
              <button onClick={() => setShowAddItem(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => setItemMode('product')}
                className={`py-2.5 rounded-2xl text-sm font-bold transition-all ${itemMode === 'product' ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-white text-gray-400 shadow-sm'}`}>
                🛒 เลือกจากระบบ
              </button>
              <button onClick={() => setItemMode('custom')}
                className={`py-2.5 rounded-2xl text-sm font-bold transition-all ${itemMode === 'custom' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500 text-white' : 'bg-white text-gray-400 shadow-sm'}`}>
                ✏️ พิมพ์เอง
              </button>
            </div>
            <div className="space-y-3">
              {itemMode === 'product' ? (
                <div>
                  <label className="text-xs text-gray-400">ค้นหาสินค้า</label>
                  <input value={itemProductSearch} onChange={e => setItemProductSearch(e.target.value)}
                    placeholder="ค้นหาชื่อสินค้า..."
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5">
                    {filteredProducts.slice(0, 20).map(p => (
                      <button key={p.id} onClick={() => { setItemProductId(p.id); setItemProductSearch(p.name) }}
                        className={`w-full text-left bg-white rounded-xl px-3 py-2.5 shadow-sm active:scale-[0.98] ${itemProductId === p.id ? 'ring-2 ring-orange-400' : ''}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-800">{p.name}</span>
                          <span className={`text-xs font-semibold ${p.stock_qty <= 5 ? 'text-red-400' : 'text-gray-400'}`}>stock: {p.stock_qty} {p.unit}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-400">ชื่อสินค้า</label>
                  <input value={itemCustomName} onChange={e => setItemCustomName(e.target.value)}
                    placeholder="เช่น Pramy AD1 สีฟ้า"
                    className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-400">ชื่อสั้น (สำหรับคัดลอก) <span className="text-gray-300">— ไม่ใส่ก็ได้ค่ะ</span></label>
                <input value={itemShortName} onChange={e => setItemShortName(e.target.value)}
                  placeholder="เช่น ทูน่า สีฟ้า"
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400">1 ออเดอร์ = กี่ชิ้น</label>
                  <input type="number" value={itemUnitsPerOrder} onChange={e => setItemUnitsPerOrder(Number(e.target.value))}
                    min="1" className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm text-center font-bold" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">ปกติสั่งกี่ออเดอร์</label>
                  <input type="number" value={itemOrderQty} onChange={e => setItemOrderQty(Number(e.target.value))}
                    min="1" className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm text-center font-bold" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">หมายเหตุ (ถ้ามี)</label>
                <input value={itemNote} onChange={e => setItemNote(e.target.value)}
                  placeholder="เช่น รุ่นใหม่, ราคาพิเศษ"
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
            </div>
            <button onClick={handleAddItem} disabled={saving || (itemMode === 'product' && !itemProductId) || (itemMode === 'custom' && !itemCustomName.trim())}
              className="w-full bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95">
              {saving ? 'กำลังบันทึก...' : '✅ เพิ่มสินค้า'}
            </button>
          </div>
        </div>
      )}

      {/* ══ Edit Item Modal ══ */}
      {showEditItem && editingItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">✏️ แก้ไข</h3>
              <button onClick={() => { setShowEditItem(false); setEditingItem(null) }} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400">ชื่อสินค้า</label>
                <input value={editingItem.product_name} onChange={e => setEditingItem({ ...editingItem, product_name: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-400">ชื่อสั้น (สำหรับคัดลอก)</label>
                <input value={editingItem.short_name || ''} onChange={e => setEditingItem({ ...editingItem, short_name: e.target.value })}
                  placeholder="เช่น ทูน่า สีฟ้า"
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400">1 ออเดอร์ = กี่ชิ้น</label>
                  <input type="number" value={editingItem.units_per_order} onChange={e => setEditingItem({ ...editingItem, units_per_order: Number(e.target.value) })}
                    min="1" className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm text-center font-bold" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">ปกติสั่งกี่ออเดอร์</label>
                  <input type="number" value={editingItem.order_qty} onChange={e => setEditingItem({ ...editingItem, order_qty: Number(e.target.value) })}
                    min="1" className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm text-center font-bold" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">หมายเหตุ</label>
                <input value={editingItem.note || ''} onChange={e => setEditingItem({ ...editingItem, note: e.target.value })}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
            </div>
            <button onClick={handleSaveEdit} disabled={saving}
              className="w-full bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95">
              {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
            </button>
          </div>
        </div>
      )}

      {/* ══ Order Session Modal ══ */}
      {showOrderSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">📋 กรอกจำนวนสั่ง</h3>
              <button onClick={() => setShowOrderSession(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="space-y-2 mb-4">
              {orderEntries.map((entry) => (
                <div key={entry.itemId} className="bg-white rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{entry.name}</p>
                      <p className="text-xs text-gray-400">{entry.groupName}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => updateEntryQty(entry.itemId, entry.qty - 1)}
                        className="w-8 h-8 bg-gray-100 rounded-xl text-gray-500 font-bold flex items-center justify-center active:scale-95">−</button>
                      <input type="number" value={entry.qty} min="0"
                        onChange={e => updateEntryQty(entry.itemId, Number(e.target.value))}
                        className="w-14 text-center bg-gray-50 rounded-xl py-2 text-sm font-bold outline-none" />
                      <button onClick={() => updateEntryQty(entry.itemId, entry.qty + 1)}
                        className="w-8 h-8 bg-orange-100 rounded-xl text-orange-500 font-bold flex items-center justify-center active:scale-95">+</button>
                      <button onClick={() => setOrderEntries(prev => prev.filter(e => e.itemId !== entry.itemId))}
                        className="w-8 h-8 bg-red-50 rounded-xl text-red-300 flex items-center justify-center text-xs active:scale-95">✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {generateCopyText() ? (
              <div className="bg-gray-50 rounded-2xl p-3 mb-3 font-mono text-xs whitespace-pre-wrap text-gray-700 max-h-36 overflow-y-auto">
                {generateCopyText()}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-2xl p-3 mb-3 text-center text-gray-300 text-xs">กรอกจำนวนก่อนค่ะ</div>
            )}

            <div className="space-y-2">
              <button
                onClick={() => { const t = generateCopyText(); if (!t) return; navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                disabled={!generateCopyText()}
                className={`w-full font-bold py-3.5 rounded-2xl transition-colors disabled:opacity-50 ${copied ? 'bg-teal-500 text-white' : 'bg-gradient-to-r from-orange-400 to-rose-400 text-white'}`}>
                {copied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกรายการ'}
              </button>
              <button onClick={handleSaveStats} disabled={saving || orderEntries.filter(e => e.qty > 0).length === 0}
                className="w-full bg-purple-500 text-white font-bold py-3.5 rounded-2xl disabled:opacity-50 active:scale-95">
                {saving ? 'กำลังบันทึก...' : '💾 บันทึกสถิติ'}
              </button>
              <button onClick={() => setShowOrderSession(false)}
                className="w-full bg-white text-gray-500 font-bold py-3 rounded-2xl shadow-sm text-sm">ปิด</button>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}