'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Product = {
  id: string
  name: string
  selling_price: number
  stock_qty: number
  unit: string
}

type GroupItem = {
  id: string
  product_id: string
  product_name: string
  product_price: number
  product_unit: string
  stock_qty: number
  custom_qty: number
  sort_order: number
}

type PostGroup = {
  id: string
  name: string
  sort_order: number
  items: GroupItem[]
}

export default function PostPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<PostGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Add group
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // Edit group
  const [editingGroup, setEditingGroup] = useState<PostGroup | null>(null)
  const [showAddItem, setShowAddItem] = useState(false)
  const [searchProduct, setSearchProduct] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: groupData }, { data: itemData }, { data: productData }] = await Promise.all([
      supabase.from('post_groups').select('*').order('sort_order'),
      supabase.from('post_group_items').select('*, products(id, name, selling_price, stock_qty, unit)').order('sort_order'),
      supabase.from('products').select('id, name, selling_price, stock_qty, unit').eq('is_active', true).order('name'),
    ])

    const combined: PostGroup[] = (groupData || []).map(g => ({
      ...g,
      items: (itemData || [])
        .filter(i => i.group_id === g.id)
        .map(i => ({
          id: i.id,
          product_id: i.product_id,
          product_name: i.products?.name || '',
          product_price: i.products?.selling_price || 0,
          product_unit: i.products?.unit || 'ซอง',
          stock_qty: i.products?.stock_qty || 0,
          custom_qty: i.custom_qty ?? i.products?.stock_qty ?? 0,
          sort_order: i.sort_order,
        })),
    }))

    setGroups(combined)
    setProducts(productData || [])
    setLoading(false)
  }

  async function handleAddGroup() {
    if (!newGroupName.trim()) return
    await supabase.from('post_groups').insert({
      name: newGroupName.trim(),
      sort_order: groups.length,
    })
    setNewGroupName('')
    setShowAddGroup(false)
    fetchData()
  }

  async function handleDeleteGroup(id: string, name: string) {
    if (!confirm(`ลบกรุ๊ป "${name}"?`)) return
    await supabase.from('post_groups').delete().eq('id', id)
    fetchData()
  }

  async function handleRenameGroup(group: PostGroup, newName: string) {
    await supabase.from('post_groups').update({ name: newName }).eq('id', group.id)
    fetchData()
  }

  async function handleAddItem(product: Product) {
    if (!editingGroup) return
    const exists = editingGroup.items.find(i => i.product_id === product.id)
    if (exists) return

    await supabase.from('post_group_items').insert({
      group_id: editingGroup.id,
      product_id: product.id,
      custom_qty: product.stock_qty,
      sort_order: editingGroup.items.length,
    })

    setShowAddItem(false)
    setSearchProduct('')
    fetchData()
    // รีเฟรช editingGroup
    setTimeout(() => {
      setGroups(prev => {
        const updated = prev.find(g => g.id === editingGroup.id)
        if (updated) setEditingGroup(updated)
        return prev
      })
    }, 500)
  }

  async function handleUpdateQty(itemId: string, qty: number) {
    await supabase.from('post_group_items').update({ custom_qty: qty }).eq('id', itemId)
    setGroups(prev => prev.map(g => ({
      ...g,
      items: g.items.map(i => i.id === itemId ? { ...i, custom_qty: qty } : i)
    })))
    if (editingGroup) {
      setEditingGroup(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === itemId ? { ...i, custom_qty: qty } : i)
      } : null)
    }
  }

  async function handleDeleteItem(itemId: string) {
    await supabase.from('post_group_items').delete().eq('id', itemId)
    fetchData()
    setTimeout(() => {
      setGroups(prev => {
        const updated = prev.find(g => g.id === editingGroup?.id)
        if (updated) setEditingGroup(updated)
        return prev
      })
    }, 500)
  }

  function generatePostText(group: PostGroup): string {
    if (group.items.length === 0) return ''

    // ราคาแรกของสินค้าในกรุ๊ป
    const price = group.items[0]?.product_price
    const unit = group.items[0]?.product_unit || 'ซอง'

    let text = `${group.name} ${unit}ล่ะ ${price}฿\n`
    group.items.forEach(item => {
      text += `- ${item.product_name} ว่าง ${item.custom_qty}\n`
    })
    return text.trim()
  }

  function handleCopy(group: PostGroup) {
    const text = generatePostText(group)
    navigator.clipboard.writeText(text)
    setCopiedId(group.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) &&
    !editingGroup?.items.find(i => i.product_id === p.id)
  )

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
            <h1 className="text-xl font-bold text-gray-800">📢 โพสขาย</h1>
          </div>
          <button onClick={() => setShowAddGroup(true)}
            className="bg-blue-500 text-white text-sm px-3 py-2 rounded-xl">
            + กรุ๊ป
          </button>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
        ) : groups.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">📢</div>
            <p>ยังไม่มีกรุ๊ปค่ะ</p>
            <p className="text-sm mt-1">กด + กรุ๊ป เพื่อเริ่มต้นค่ะ</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => (
              <div key={group.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Group Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="font-bold text-gray-800">{group.name}</div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingGroup(group); setShowAddItem(false) }}
                      className="text-blue-500 text-sm bg-blue-50 px-2 py-1 rounded-lg">
                      ✏️ แก้ไข
                    </button>
                    <button onClick={() => handleDeleteGroup(group.id, group.name)}
                      className="text-red-400 text-sm bg-red-50 px-2 py-1 rounded-lg">
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Items */}
                {group.items.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-gray-400">ยังไม่มีสินค้าค่ะ</div>
                ) : (
                  <div className="px-4 py-2">
                    {group.items.map(item => (
                      <div key={item.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-700 truncate">{item.product_name}</div>
                          <div className="text-xs text-gray-400">{item.product_price}฿ · stock {item.stock_qty}</div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-xs text-gray-500">ว่าง</span>
                          <input type="number" value={item.custom_qty}
                            onChange={e => handleUpdateQty(item.id, Number(e.target.value))}
                            className="w-14 border border-gray-200 rounded-lg p-1 text-sm text-center"
                            min="0" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Preview + Copy */}
                {group.items.length > 0 && (
                  <div className="px-4 pb-3">
                    <div className="bg-gray-50 rounded-xl p-3 mb-2 font-mono text-xs text-gray-700 whitespace-pre-wrap">
                      {generatePostText(group)}
                    </div>
                    <button onClick={() => handleCopy(group)}
                      className={`w-full font-bold py-2.5 rounded-xl text-sm transition-colors ${
                        copiedId === group.id ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
                      }`}>
                      {copiedId === group.id ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกข้อความ'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Group Modal */}
        {showAddGroup && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
              <h3 className="font-bold mb-3">+ เพิ่มกรุ๊ป</h3>
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                autoFocus
                className="w-full border border-gray-200 rounded-xl p-2 text-sm mb-3"
                placeholder="เช่น แมวเลีย VF" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setShowAddGroup(false); setNewGroupName('') }}
                  className="bg-gray-100 text-gray-600 py-2 rounded-xl">ยกเลิก</button>
                <button onClick={handleAddGroup} disabled={!newGroupName.trim()}
                  className="bg-blue-500 text-white py-2 rounded-xl disabled:opacity-50">เพิ่ม</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Group Modal */}
        {editingGroup && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">✏️ แก้ไขกรุ๊ป</h3>
                <button onClick={() => { setEditingGroup(null); setShowAddItem(false); fetchData() }}
                  className="text-gray-400 text-xl">✕</button>
              </div>

              {/* ชื่อกรุ๊ป */}
              <div className="mb-3">
                <label className="text-xs text-gray-500">ชื่อกรุ๊ป</label>
                <div className="flex gap-2 mt-1">
                  <input defaultValue={editingGroup.name}
                    id="groupNameInput"
                    className="flex-1 border border-gray-200 rounded-xl p-2 text-sm" />
                  <button onClick={() => {
                    const input = document.getElementById('groupNameInput') as HTMLInputElement
                    if (input?.value) handleRenameGroup(editingGroup, input.value)
                  }}
                    className="bg-blue-500 text-white px-3 rounded-xl text-sm">บันทึก</button>
                </div>
              </div>

              {/* รายการสินค้า */}
              <div className="mb-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs text-gray-500">รายการสินค้า ({editingGroup.items.length})</label>
                  <button onClick={() => setShowAddItem(true)}
                    className="text-xs bg-blue-500 text-white px-2 py-1 rounded-lg">+ เพิ่มสินค้า</button>
                </div>

                {editingGroup.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.product_name}</div>
                      <div className="text-xs text-gray-400">{item.product_price}฿ · stock {item.stock_qty}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">ว่าง</span>
                      <input type="number" value={item.custom_qty}
                        onChange={e => handleUpdateQty(item.id, Number(e.target.value))}
                        className="w-14 border border-gray-200 rounded-lg p-1 text-sm text-center"
                        min="0" />
                    </div>
                    <button onClick={() => handleDeleteItem(item.id)}
                      className="text-red-400 text-sm">✕</button>
                  </div>
                ))}
              </div>

              {/* ค้นหาสินค้าเพิ่ม */}
              {showAddItem && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <input value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                    autoFocus
                    className="w-full border border-gray-200 rounded-xl p-2 text-sm mb-2"
                    placeholder="🔍 ค้นหาสินค้า..." />
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredProducts.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-4">ไม่พบสินค้าค่ะ</p>
                    ) : filteredProducts.map(p => (
                      <button key={p.id} onClick={() => handleAddItem(p)}
                        className="w-full text-left bg-white rounded-lg p-2 flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium">{p.name}</div>
                          <div className="text-xs text-gray-400">{p.selling_price}฿ · stock {p.stock_qty}</div>
                        </div>
                        <span className="text-blue-500 text-xs">+ เพิ่ม</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setShowAddItem(false); setSearchProduct('') }}
                    className="w-full bg-gray-200 text-gray-600 py-2 rounded-xl text-sm mt-2">ปิด</button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}