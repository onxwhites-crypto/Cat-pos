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
  const [selectMode, setSelectMode] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])

  // Preview
  const [showPreview, setShowPreview] = useState(false)
  const [previewCopied, setPreviewCopied] = useState(false)

  // ── ย่อ/ขยาย โพสหลัก ──
  const [isPostExpanded, setIsPostExpanded] = useState(false)

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

  function getFeaturedLine(group: PostGroup): string {
    if (group.items.length === 0) return ''
    const price = group.items[0]?.product_price
    const unit = group.items[0]?.product_unit || 'ซอง'
    const promo = promotions.find(p =>
      p.promotion_products.some((pp: any) =>
        group.items.some(i => i.product_id === pp.product_id)
      )
    )
    let line = `${group.name} ${unit}ล่ะ ${price}฿`
    if (promo) line += ` ยกโหล ${promo.dozen_qty} ${unit} ${promo.dozen_price}฿ คละรสได้`
    return line
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

  function generateFullPostText(): string {
    const featured = groups
      .filter(g => g.items.length > 0)
      .map(g => getFeaturedLine(g))
      .join('\n')
    const details = groups
      .filter(g => g.items.length > 0)
      .map(g => generatePostText(g))
      .join('\n\n')
    return [featured, details].filter(Boolean).join('\n\n').trim()
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
    <main className="min-h-screen bg-[#fff5f3]">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')}
              className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform">
              ←
            </button>
            <h1 className="text-lg font-bold text-gray-800">📢 โพสขาย</h1>
          </div>
          <div className="flex gap-2">
            {selectMode ? (
              <>
                <button
                  onClick={async () => {
                    if (selectedGroupIds.length === 0) return
                    if (!confirm(`ลบ ${selectedGroupIds.length} กรุ๊ปที่เลือก?`)) return
                    await Promise.all(selectedGroupIds.map(id => supabase.from('post_groups').delete().eq('id', id)))
                    setSelectMode(false); setSelectedGroupIds([]); fetchData()
                  }}
                  disabled={selectedGroupIds.length === 0}
                  className="bg-red-50 text-red-400 text-xs px-3 py-2 rounded-xl font-semibold disabled:opacity-40">
                  🗑️ ลบ ({selectedGroupIds.length})
                </button>
                <button onClick={() => { setSelectMode(false); setSelectedGroupIds([]) }}
                  className="bg-white text-gray-500 text-xs px-3 py-2 rounded-xl shadow-sm font-semibold">
                  ยกเลิก
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setSelectMode(true)}
                  className="bg-white text-rose-400 text-xs px-3 py-2 rounded-xl shadow-sm font-semibold">
                  🗑️ เลือกลบ
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('ลบกรุ๊ปทั้งหมด?')) return
                    await Promise.all(groups.map(g => supabase.from('post_groups').delete().eq('id', g.id)))
                    fetchData()
                  }}
                  className="bg-red-50 text-red-400 text-xs px-3 py-2 rounded-xl shadow-sm font-semibold">
                  🗑️ ลบทั้งหมด
                </button>
                <button onClick={() => setShowAddGroup(true)}
                  className="bg-gradient-to-r from-orange-400 to-rose-400 text-white text-xs px-3 py-2 rounded-xl font-semibold shadow-sm">
                  + กรุ๊ป
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-8 space-y-3 pt-2">

        {/* ══ โพสหลัก (ย่อ/ขยายได้) ══ */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

          {/* Header — คลิกเพื่อย่อ/ขยาย */}
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer active:bg-gray-50 transition-colors"
            onClick={() => setIsPostExpanded(prev => !prev)}
          >
            <div>
              <p className="font-bold text-gray-800 text-sm">⭐ โพสหลัก</p>
              <p className="text-xs text-gray-400 mt-0.5">สรุปอัตโนมัติจากกรุ๊ปด้านล่าง</p>
            </div>
            <div className="flex items-center gap-2">
              {/* ปุ่มคัดลอก — หยุด event ไม่ให้ toggle */}
              <button
                onClick={e => {
                  e.stopPropagation()
                  const text = groups.filter(g => g.items.length > 0).map(g => getFeaturedLine(g)).join('\n')
                  navigator.clipboard.writeText(text)
                  setPreviewCopied(true)
                  setTimeout(() => setPreviewCopied(false), 2000)
                }}
                className={`text-xs px-3 py-2 rounded-xl font-semibold active:scale-95 transition-transform ${previewCopied ? 'bg-teal-500 text-white' : 'bg-gradient-to-r from-orange-400 to-rose-400 text-white'}`}
              >
                {previewCopied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอก'}
              </button>
              {/* ไอคอนลูกศรบอกสถานะ */}
              <span className="text-gray-400 text-xs w-4 text-center">
                {isPostExpanded ? '▼' : '▶'}
              </span>
            </div>
          </div>

          {/* Content — แสดงเมื่อขยาย */}
          {isPostExpanded && (
            <div className="px-4 pb-3 border-t border-gray-50 space-y-1.5 pt-3">
              {groups.filter(g => g.items.length > 0).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">ยังไม่มีกรุ๊ปค่ะ</p>
              ) : (
                groups.filter(g => g.items.length > 0).map(group => (
                  <p key={group.id} className="text-sm text-gray-700 font-mono">
                    {getFeaturedLine(group)}
                  </p>
                ))
              )}
            </div>
          )}
        </div>

        {/* ══ กรุ๊ปสินค้า ══ */}
        {loading ? (
          <div className="text-center text-gray-400 py-8 text-sm">กำลังโหลด...</div>
        ) : groups.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">📢</div>
            <p className="text-sm">ยังไม่มีกรุ๊ปค่ะ</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map(group => {
              const isExpanded = expandedIds.includes(group.id)
              const isCopied = copiedId === group.id
              return (
                <div key={group.id}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden ${selectMode && selectedGroupIds.includes(group.id) ? 'ring-2 ring-rose-300' : ''}`}>

                  <div
                    onClick={() => {
                      if (selectMode) {
                        setSelectedGroupIds(prev => prev.includes(group.id) ? prev.filter(i => i !== group.id) : [...prev, group.id])
                      } else {
                        toggleExpand(group.id)
                      }
                    }}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer active:bg-gray-50">

                    {selectMode && (
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 ${selectedGroupIds.includes(group.id) ? 'bg-rose-400 border-rose-400 text-white' : 'border-gray-300'}`}>
                        {selectedGroupIds.includes(group.id) && <span className="text-xs">✓</span>}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm">{group.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {group.items.length} รายการ
                        {group.prefix && ` · ตัดคำ: "${group.prefix}"`}
                      </p>
                    </div>

                    {!selectMode && (
                      <div className="flex items-center gap-2 ml-2">
                        <button onClick={e => handleCopy(group, e)}
                          className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors ${isCopied ? 'bg-teal-500 text-white' : 'bg-gray-50 text-gray-600'}`}>
                          {isCopied ? '✅' : '📋'}
                        </button>
                        <button onClick={e => { e.stopPropagation(); setEditingGroup(group); setTempSelected(group.items.map(i => i.product_id)); setShowSelectProducts(false) }}
                          className="text-xs bg-rose-50 text-rose-400 px-2.5 py-1.5 rounded-xl">✏️</button>
                        <button onClick={e => handleDeleteGroup(group.id, group.name, e)}
                          className="text-xs bg-red-50 text-red-400 px-2.5 py-1.5 rounded-xl">🗑️</button>
                        <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
                      </div>
                    )}
                  </div>

                  {isExpanded && !selectMode && (
                    <>
                      {group.items.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-50">ยังไม่มีสินค้าค่ะ</div>
                      ) : (
                        <div className="px-4 py-2 border-t border-gray-50">
                          {group.items.map(item => (
                            <div key={item.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700 truncate">{trimPrefix(item.product_name, group.prefix)}</p>
                                <p className="text-xs text-gray-400">
                                  {item.product_price}฿ · stock {item.stock_qty}
                                  {item.stock_qty <= 0 && <span className="text-red-400 ml-1">หมด</span>}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 ml-2">
                                <span className="text-xs text-gray-400">ว่าง</span>
                                <input type="number" value={item.custom_qty}
                                  onChange={e => handleUpdateQty(item.id, Number(e.target.value))}
                                  className="w-14 bg-gray-50 rounded-xl px-2 py-1 text-sm text-center outline-none"
                                  min="0" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {group.items.length > 0 && (
                        <div className="px-4 pb-3 border-t border-gray-50">
                          <div className="bg-[#fff5f3] rounded-2xl p-3 my-2 font-mono text-xs text-gray-700 whitespace-pre-wrap">
                            {generatePostText(group)}
                          </div>
                          <button onClick={e => handleCopy(group, e)}
                            className={`w-full font-bold py-2.5 rounded-2xl text-sm transition-colors ${isCopied ? 'bg-teal-500 text-white' : 'bg-gradient-to-r from-orange-400 to-rose-400 text-white'}`}>
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
      </div>

      {/* ══ ADD GROUP ══ */}
      {showAddGroup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-gray-800 mb-3">+ เพิ่มกรุ๊ป</h3>
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()} autoFocus
              className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none mb-3 placeholder-gray-300"
              placeholder="เช่น แมวเลีย VF" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setShowAddGroup(false); setNewGroupName('') }}
                className="bg-gray-100 text-gray-500 font-semibold py-3 rounded-2xl text-sm">ยกเลิก</button>
              <button onClick={handleAddGroup} disabled={!newGroupName.trim()}
                className="bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-50">เพิ่ม</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EDIT GROUP ══ */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">✏️ แก้ไขกรุ๊ป</h3>
              <button onClick={() => { setEditingGroup(null); setShowSelectProducts(false); fetchData() }}
                className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="space-y-2 mb-3">
              <div>
                <label className="text-xs text-gray-500">ชื่อกรุ๊ป</label>
                <input defaultValue={editingGroup.name} id="groupNameInput"
                  className="w-full bg-white rounded-2xl px-4 py-3 text-sm mt-1 outline-none shadow-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">ตัดคำนำหน้าออก</label>
                <input defaultValue={editingGroup.prefix || ''} id="groupPrefixInput"
                  className="w-full bg-white rounded-2xl px-4 py-3 text-sm mt-1 outline-none shadow-sm"
                  placeholder="เช่น VF+core , Pramy" />
                <p className="text-xs text-gray-400 mt-1 px-1">ชื่อสินค้าจะตัดคำนี้ออกตอนแสดงผลค่ะ</p>
              </div>
              <button onClick={() => {
                const nameInput = document.getElementById('groupNameInput') as HTMLInputElement
                const prefixInput = document.getElementById('groupPrefixInput') as HTMLInputElement
                handleSaveGroupInfo(editingGroup, nameInput?.value || editingGroup.name, prefixInput?.value || '')
              }} className="w-full bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold py-3 rounded-2xl text-sm">
                💾 บันทึกชื่อ/คำนำหน้า
              </button>
            </div>

            <div className="mb-3">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs text-gray-500">สินค้าในกรุ๊ป ({editingGroup.items.length})</label>
                <button onClick={() => { setTempSelected(editingGroup.items.map(i => i.product_id)); setShowSelectProducts(true); setSearchProduct('') }}
                  className="text-xs bg-rose-50 text-rose-400 px-3 py-1.5 rounded-xl font-semibold">✏️ เลือกสินค้า</button>
              </div>
              {editingGroup.items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">ยังไม่มีสินค้าค่ะ</p>
              ) : (
                editingGroup.items.map(item => (
                  <div key={item.id} className="bg-white rounded-2xl px-4 py-3 mb-1.5 shadow-sm flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{trimPrefix(item.product_name, editingGroup.prefix)}</p>
                      <p className="text-xs text-gray-400">{item.product_price}฿ · stock {item.stock_qty}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">ว่าง</span>
                      <input type="number" value={item.custom_qty}
                        onChange={e => handleUpdateQty(item.id, Number(e.target.value))}
                        className="w-14 bg-gray-50 rounded-xl px-2 py-1 text-sm text-center outline-none" min="0" />
                    </div>
                  </div>
                ))
              )}
            </div>

            {showSelectProducts && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="font-semibold text-sm text-gray-700 mb-2">เลือกสินค้า ({tempSelected.length})</p>
                <input value={searchProduct} onChange={e => setSearchProduct(e.target.value)} autoFocus
                  className="w-full bg-gray-50 rounded-2xl px-4 py-2.5 text-sm outline-none mb-2 placeholder-gray-300"
                  placeholder="🔍 ค้นหาสินค้า..." />
                <div className="max-h-52 overflow-y-auto space-y-1 mb-3">
                  {filteredProducts.map(p => {
                    const isSelected = tempSelected.includes(p.id)
                    return (
                      <button key={p.id}
                        onClick={() => setTempSelected(prev => isSelected ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                        className={`w-full text-left rounded-2xl px-3 py-2.5 flex justify-between items-center ${isSelected ? 'bg-rose-50' : 'bg-gray-50'}`}>
                        <div>
                          <p className="text-sm font-medium">{trimPrefix(p.name, editingGroup.prefix)}</p>
                          <p className="text-xs text-gray-400">{p.selling_price}฿ · stock {p.stock_qty}{p.stock_qty <= 0 && <span className="text-red-400 ml-1">หมด</span>}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-rose-400 border-rose-400 text-white' : 'border-gray-300'}`}>
                          {isSelected && <span className="text-xs">✓</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setShowSelectProducts(false); setSearchProduct('') }}
                    className="bg-gray-100 text-gray-500 py-3 rounded-2xl text-sm font-semibold">ยกเลิก</button>
                  <button onClick={handleSaveItems} disabled={saving}
                    className="bg-gradient-to-r from-orange-400 to-rose-400 text-white py-3 rounded-2xl text-sm font-bold disabled:opacity-50">
                    {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ PREVIEW POPUP ══ */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end" onClick={() => setShowPreview(false)}>
          <div className="bg-[#fff5f3] w-full rounded-t-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center px-4 py-2 mb-3">
              <h3 className="font-bold text-gray-800 text-lg">⭐ โพสหลัก</h3>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="mx-4 bg-white rounded-2xl p-4 mb-4 shadow-sm font-mono text-sm text-gray-700 whitespace-pre-wrap">
              {groups.filter(g => g.items.length > 0).map(g => getFeaturedLine(g)).join('\n') || 'ยังไม่มีข้อความค่ะ'}
            </div>
            <div className="px-4 pb-8">
              <button
                onClick={() => {
                  const text = groups.filter(g => g.items.length > 0).map(g => getFeaturedLine(g)).join('\n')
                  navigator.clipboard.writeText(text)
                  setPreviewCopied(true)
                  setTimeout(() => setPreviewCopied(false), 2000)
                }}
                className={`w-full font-bold py-4 rounded-2xl transition-all ${previewCopied ? 'bg-teal-500 text-white' : 'bg-gradient-to-r from-orange-400 to-rose-500 text-white'}`}
              >
                {previewCopied ? '✅ คัดลอกแล้ว!' : '📋 คัดลอกข้อความ'}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}