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
  prefix: string | null
  items: GroupItem[]
}

export default function PostPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<PostGroup[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroup, setEditingGroup] = useState<PostGroup | null>(null)
  const [showSelectProducts, setShowSelectProducts] = useState(false)
  const [searchProduct, setSearchProduct] = useState('')
  const [tempSelected, setTempSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: groupData }, { data: itemData }, { data: productData }, { data: promoData }] = await Promise.all([
      supabase.from('post_groups').select('*').order('sort_order'),
      supabase.from('post_group_items').select('*, products(id, name, selling_price, stock_qty, unit)').order('sort_order'),
      supabase.from('products').select('id, name, selling_price, stock_qty, unit').eq('is_active', true).order('name'),
      supabase.from('promotions').select('*, promotion_products(product_id)').eq('is_active', true),
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
        }))
        .sort((a, b) => {
          if (a.stock_qty > 0 && b.stock_qty <= 0) return -1
          if (a.stock_qty <= 0 && b.stock_qty > 0) return 1
          return a.sort_order - b.sort_order
        }),
    }))

    setGroups(combined)
    setProducts(productData || [])
    setPromotions(promoData || [])
    setLoading(false)
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  function trimPrefix(name: string, prefix: string | null): string {
    if (!prefix || !prefix.trim()) return name
    const p = prefix.trim()
    if (name.toLowerCase().startsWith(p.toLowerCase())) {
      return name.substring(p.length).trim()
    }
    return name
  }

  function generatePostText(group: PostGroup): string {
    if (group.items.length === 0) return ''
    const price = group.items[0]?.product_price
    const unit = group.items[0]?.product_unit || 'ซอง'

    const promo = promotions.find(p =>
      p.promotion_products.some((pp: any) =>
        group.items.some(i => i.product_id === pp.product_id)
      )
    )

    let text = `${group.name} ${unit}ล่ะ ${price}฿`
    if (promo) text += ` ยกโหล ${promo.dozen_qty} ${unit} ${promo.dozen_price}฿ คละรสได้`
    text += '\n'

    group.items.forEach(item => {
      const displayName = trimPrefix(item.product_name, group.prefix)
      text += `- ${displayName} ว่าง ${item.custom_qty}\n`
    })
    return text.trim()
  }

  function handleCopy(group: PostGroup, e: React.MouseEvent) {
    e.stopPropagation()
    const text = generatePostText(group)
    navigator.clipboard.writeText(text)
    setCopiedId(group.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleAddGroup() {
    if (!newGroupName.trim()) return
    await supabase.from('post_groups').insert({ name: newGroupName.trim(), sort_order: groups.length })
    setNewGroupName('')
    setShowAddGroup(false)
    fetchData()
  }

  async function handleDeleteGroup(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`ลบกรุ๊ป "${name}"?`)) return
    await supabase.from('post_groups').delete().eq('id', id)
    fetchData()
  }

  async function handleSaveGroupInfo(group: PostGroup, newName: string, newPrefix: string) {
    await supabase.from('post_groups').update({
      name: newName.trim() || group.name,
      prefix: newPrefix.trim() || null,
    }).eq('id', group.id)
    fetchData()
  }

  async function handleSaveItems() {
    if (!editingGroup) return
    setSaving(true)
    await supabase.from('post_group_items').delete().eq('group_id', editingGroup.id)
    if (tempSelected.length > 0) {
      const items = tempSelected.map((pid, i) => {
        const product = products.find(p => p.id === pid)
        return { group_id: editingGroup.id, product_id: pid, custom_qty: product?.stock_qty || 0, sort_order: i }
      })
      await supabase.from('post_group_items').insert(items)
    }
    setShowSelectProducts(false)
    setSearchProduct('')
    setSaving(false)
    fetchData()
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
    setGroups(prev => prev.map(g => ({ ...g, items: g.items.map(i => i.id === itemId ? { ...i, custom_qty: qty } : i) })))
    if (editingGroup) {
      setEditingGroup(prev => prev ? { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, custom_qty: qty } : i) } : null)
    }
  }

  const filteredProducts = products
    .filter(p => p.name.toLowerCase().includes(searchProduct.toLowerCase()))
    .sort((a, b) => {
      if (a.stock_qty > 0 && b.stock_qty <= 0) return -1
      if (a.stock_qty <= 0 && b.stock_qty > 0) return 1
      return 0
    })

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
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map(group => {
              const isExpanded = expandedIds.includes(group.id)
              const isCopied = copiedId === group.id

              return (
                <div key={group.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">

                  {/* Group Header - กดเพื่อย่อ/ขยาย */}
                  <button onClick={() => toggleExpand(group.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-800">{group.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {group.items.length} รายการ
                        {group.prefix && ` · ตัดคำ: "${group.prefix}"`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {/* ปุ่ม copy */}
                      <button onClick={e => handleCopy(group, e)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          isCopied ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
                        }`}>
                        {isCopied ? '✅' : '📋'}
                      </button>
                      {/* ปุ่มแก้ไข */}
                      <button onClick={e => {
                        e.stopPropagation()
                        setEditingGroup(group)
                        setTempSelected(group.items.map(i => i.product_id))
                        setShowSelectProducts(false)
                      }}
                        className="text-blue-500 text-sm bg-blue-50 px-2 py-1.5 rounded-lg">✏️</button>
                      {/* ปุ่มลบ */}
                      <button onClick={e => handleDeleteGroup(group.id, group.name, e)}
                        className="text-red-400 text-sm bg-red-50 px-2 py-1.5 rounded-lg">🗑️</button>
                      {/* ลูกศร */}
                      <span className="text-gray-400 text-sm">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <>
                      {/* รายการสินค้า */}
                      {group.items.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">ยังไม่มีสินค้าค่ะ</div>
                      ) : (
                        <div className="px-4 py-2 border-t border-gray-100">
                          {group.items.map(item => (
                            <div key={item.id} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-700 truncate">
                                  {trimPrefix(item.product_name, group.prefix)}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {item.product_price}฿ · stock {item.stock_qty}
                                  {item.stock_qty <= 0 && <span className="text-red-400 ml-1">หมด</span>}
                                </div>
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

                      {/* Preview + Copy Button */}
                      {group.items.length > 0 && (
                        <div className="px-4 pb-3 border-t border-gray-100">
                          <div className="bg-gray-50 rounded-xl p-3 my-2 font-mono text-xs text-gray-700 whitespace-pre-wrap">
                            {generatePostText(group)}
                          </div>
                          <button onClick={e => handleCopy(group, e)}
                            className={`w-full font-bold py-2.5 rounded-xl text-sm transition-colors ${
                              isCopied ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'
                            }`}>
                            {isCopied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกข้อความ'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Add Group Modal */}
        {showAddGroup && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-4 w-full max-w-sm">
              <h3 className="font-bold mb-3">+ เพิ่มกรุ๊ป</h3>
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                autoFocus className="w-full border border-gray-200 rounded-xl p-2 text-sm mb-3"
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
                <button onClick={() => { setEditingGroup(null); setShowSelectProducts(false); fetchData() }}
                  className="text-gray-400 text-xl">✕</button>
              </div>

              <div className="space-y-2 mb-3">
                <div>
                  <label className="text-xs text-gray-500">ชื่อกรุ๊ป</label>
                  <input defaultValue={editingGroup.name} id="groupNameInput"
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">ตัดคำนำหน้าออก</label>
                  <input defaultValue={editingGroup.prefix || ''} id="groupPrefixInput"
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="เช่น VF+core , Pramy" />
                  <div className="text-xs text-gray-400 mt-1">ชื่อสินค้าจะตัดคำนี้ออกตอนแสดงผลค่ะ</div>
                </div>
                <button onClick={() => {
                  const nameInput = document.getElementById('groupNameInput') as HTMLInputElement
                  const prefixInput = document.getElementById('groupPrefixInput') as HTMLInputElement
                  handleSaveGroupInfo(editingGroup, nameInput?.value || editingGroup.name, prefixInput?.value || '')
                }}
                  className="w-full bg-blue-500 text-white py-2 rounded-xl text-sm">
                  💾 บันทึกชื่อ/คำนำหน้า
                </button>
              </div>

              <div className="mb-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs text-gray-500">สินค้าในกรุ๊ป ({editingGroup.items.length})</label>
                  <button onClick={() => { setTempSelected(editingGroup.items.map(i => i.product_id)); setShowSelectProducts(true); setSearchProduct('') }}
                    className="text-xs bg-blue-500 text-white px-2 py-1 rounded-lg">✏️ เลือกสินค้า</button>
                </div>

                {editingGroup.items.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">ยังไม่มีสินค้าค่ะ</p>
                ) : (
                  editingGroup.items.map(item => (
                    <div key={item.id} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{trimPrefix(item.product_name, editingGroup.prefix)}</div>
                        <div className="text-xs text-gray-400">{item.product_price}฿ · stock {item.stock_qty}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">ว่าง</span>
                        <input type="number" value={item.custom_qty}
                          onChange={e => handleUpdateQty(item.id, Number(e.target.value))}
                          className="w-14 border border-gray-200 rounded-lg p-1 text-sm text-center" min="0" />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {showSelectProducts && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="font-medium text-sm text-gray-700 mb-2">เลือกสินค้า ({tempSelected.length} รายการ)</div>
                  <input value={searchProduct} onChange={e => setSearchProduct(e.target.value)}
                    autoFocus className="w-full border border-gray-200 rounded-xl p-2 text-sm mb-2"
                    placeholder="🔍 ค้นหาสินค้า..." />
                  <div className="max-h-52 overflow-y-auto space-y-1 mb-2">
                    {filteredProducts.map(p => {
                      const isSelected = tempSelected.includes(p.id)
                      return (
                        <button key={p.id}
                          onClick={() => setTempSelected(prev => isSelected ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                          className={`w-full text-left rounded-lg p-2 flex justify-between items-center ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                          <div>
                            <div className="text-sm font-medium">{trimPrefix(p.name, editingGroup.prefix)}</div>
                            <div className="text-xs text-gray-400">
                              {p.selling_price}฿ · stock {p.stock_qty}
                              {p.stock_qty <= 0 && <span className="text-red-400 ml-1">หมด</span>}
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
                            {isSelected && <span className="text-xs">✓</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setShowSelectProducts(false); setSearchProduct('') }}
                      className="bg-gray-200 text-gray-600 py-2 rounded-xl text-sm">ยกเลิก</button>
                    <button onClick={handleSaveItems} disabled={saving}
                      className="bg-blue-500 text-white py-2 rounded-xl text-sm font-bold disabled:opacity-50">
                      {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}