'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Product = { id: string; name: string; selling_price: number }
type Promotion = {
  id: string
  name: string
  unit_price: number
  dozen_price: number
  dozen_qty: number
  is_active: boolean
  promotion_products: { product_id: string; products: { name: string } | null }[]
}

export default function PromotionsPage() {
  const router = useRouter()
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchProduct, setSearchProduct] = useState('')
  const [form, setForm] = useState({
    name: '',
    unit_price: '',
    dozen_price: '',
    dozen_qty: '12',
    is_active: true,
    selectedProducts: [] as string[],
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: promos }, { data: prods }] = await Promise.all([
      supabase.from('promotions').select('*, promotion_products(product_id, products(name))').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, selling_price').eq('is_active', true).order('name'),
    ])
    setPromotions(promos || [])
    setProducts(prods || [])
  }

  function openAdd() {
    setForm({ name: '', unit_price: '', dozen_price: '', dozen_qty: '12', is_active: true, selectedProducts: [] })
    setEditingPromo(null)
    setShowAdd(true)
  }

  function openEdit(promo: Promotion) {
    setForm({
      name: promo.name,
      unit_price: promo.unit_price?.toString() || '',
      dozen_price: promo.dozen_price?.toString() || '',
      dozen_qty: promo.dozen_qty?.toString() || '12',
      is_active: promo.is_active,
      selectedProducts: promo.promotion_products.map(pp => pp.product_id),
    })
    setEditingPromo(promo)
    setShowAdd(true)
  }

  function toggleProduct(productId: string) {
    setForm(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.includes(productId)
        ? prev.selectedProducts.filter(id => id !== productId)
        : [...prev.selectedProducts, productId],
    }))
  }

  async function handleSave() {
    if (!form.name || !form.unit_price || !form.dozen_price) return
    setSaving(true)
    try {
      const data = {
        name: form.name,
        unit_price: Number(form.unit_price),
        dozen_price: Number(form.dozen_price),
        dozen_qty: Number(form.dozen_qty),
        is_active: form.is_active,
      }

      let promoId: string
      if (editingPromo) {
        await supabase.from('promotions').update(data).eq('id', editingPromo.id)
        promoId = editingPromo.id
        await supabase.from('promotion_products').delete().eq('promotion_id', promoId)
      } else {
        const { data: newPromo } = await supabase.from('promotions').insert(data).select().single()
        promoId = newPromo!.id
      }

      if (form.selectedProducts.length > 0) {
        await supabase.from('promotion_products').insert(
          form.selectedProducts.map(pid => ({ promotion_id: promoId, product_id: pid }))
        )
      }

      setShowAdd(false)
      fetchData()
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setSaving(false)
  }

  async function toggleActive(promo: Promotion) {
    await supabase.from('promotions').update({ is_active: !promo.is_active }).eq('id', promo.id)
    fetchData()
  }

  async function deletePromo(id: string, name: string) {
    if (!confirm(`ลบโปรโมชั่น "${name}"?`)) return
    await supabase.from('promotions').delete().eq('id', id)
    fetchData()
  }

  function calcExample(promo: Promotion, qty: number) {
    const dozens = Math.floor(qty / promo.dozen_qty)
    const remainder = qty % promo.dozen_qty
    return (dozens * promo.dozen_price) + (remainder * promo.unit_price)
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase())
  )

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
            <h1 className="text-xl font-bold text-gray-800">🎁 โปรโมชั่น</h1>
          </div>
          <button onClick={openAdd}
            className="bg-orange-500 text-white text-sm px-3 py-2 rounded-xl">
            + เพิ่มโปร
          </button>
        </div>

        {/* List */}
        {promotions.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">🎁</div>
            <p>ยังไม่มีโปรโมชั่นค่ะ</p>
          </div>
        ) : (
          <div className="space-y-3">
            {promotions.map(promo => (
              <div key={promo.id} className={`bg-white rounded-2xl p-4 shadow-sm ${!promo.is_active ? 'opacity-60' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-bold text-gray-800">{promo.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {promo.unit_price}฿/ซอง · ยกโหล {promo.dozen_qty} ซอง = {promo.dozen_price}฿
                    </div>
                  </div>
                  <button onClick={() => toggleActive(promo)}
                    className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${promo.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${promo.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* ตัวอย่างคำนวณ */}
                <div className="bg-orange-50 rounded-xl p-2 mb-2 text-xs text-orange-700">
                  <span className="font-bold">ตัวอย่าง:</span>{' '}
                  ซื้อ 13 ซอง = {calcExample(promo, 13).toFixed(0)}฿ ·
                  ซื้อ 25 ซอง = {calcExample(promo, 25).toFixed(0)}฿
                </div>

                {/* สินค้าในโปร */}
                {promo.promotion_products.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-500 mb-1">สินค้าในโปร ({promo.promotion_products.length} รายการ)</div>
                    <div className="flex flex-wrap gap-1">
                      {promo.promotion_products.slice(0, 3).map(pp => (
                        <span key={pp.product_id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {pp.products?.name}
                        </span>
                      ))}
                      {promo.promotion_products.length > 3 && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          +{promo.promotion_products.length - 3} อื่นๆ
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => openEdit(promo)}
                    className="flex-1 bg-blue-100 text-blue-600 py-2 rounded-xl text-sm font-medium">
                    ✏️ แก้ไข
                  </button>
                  <button onClick={() => deletePromo(promo.id, promo.name)}
                    className="bg-red-100 text-red-500 px-3 py-2 rounded-xl text-sm">
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">{editingPromo ? 'แก้ไขโปรโมชั่น' : 'เพิ่มโปรโมชั่น'}</h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 text-xl">✕</button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">ชื่อโปรโมชั่น *</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="เช่น Pramy ธรรมดา" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">ราคา/ซอง (฿)</label>
                    <input type="number" step="0.01" value={form.unit_price}
                      onChange={e => setForm({...form, unit_price: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                      placeholder="14" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">จำนวน/โหล</label>
                    <input type="number" value={form.dozen_qty}
                      onChange={e => setForm({...form, dozen_qty: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                      placeholder="12" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">ราคายกโหล (฿)</label>
                    <input type="number" step="0.01" value={form.dozen_price}
                      onChange={e => setForm({...form, dozen_price: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                      placeholder="160" />
                  </div>
                </div>

                {/* Preview */}
                {form.unit_price && form.dozen_price && form.dozen_qty && (
                  <div className="bg-orange-50 rounded-xl p-3 text-xs text-orange-700">
                    <div className="font-bold mb-1">ตัวอย่างคำนวณ</div>
                    {[1, 12, 13, 24, 25].map(qty => {
                      const dozens = Math.floor(qty / Number(form.dozen_qty))
                      const remainder = qty % Number(form.dozen_qty)
                      const total = (dozens * Number(form.dozen_price)) + (remainder * Number(form.unit_price))
                      return (
                        <div key={qty}>
                          {qty} ซอง = {dozens > 0 ? `${dozens}โหล×${form.dozen_price}` : ''}{remainder > 0 ? `${dozens > 0 ? '+' : ''}${remainder}ซอง×${form.unit_price}` : ''} = <span className="font-bold">{total.toFixed(0)}฿</span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* เลือกสินค้า */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    เลือกสินค้าที่เข้าโปร ({form.selectedProducts.length} รายการ)
                  </label>
                  <input value={searchProduct}
                    onChange={e => setSearchProduct(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2 text-sm mb-2"
                    placeholder="🔍 ค้นหาสินค้า..." />
                  <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-xl">
                    {filteredProducts.map(p => (
                      <button key={p.id} onClick={() => toggleProduct(p.id)}
                        className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-0 flex justify-between items-center ${
                          form.selectedProducts.includes(p.id) ? 'bg-orange-50' : ''
                        }`}>
                        <div>
                          <div className="text-sm font-medium line-clamp-1">{p.name}</div>
                          <div className="text-xs text-gray-400">{p.selling_price}฿</div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          form.selectedProducts.includes(p.id) ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300'
                        }`}>
                          {form.selectedProducts.includes(p.id) && <span className="text-xs">✓</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* เปิด/ปิด */}
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <span className="text-sm font-medium">เปิดใช้งานโปรนี้</span>
                  <button onClick={() => setForm({...form, is_active: !form.is_active})}
                    className={`relative w-10 h-6 rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              <button onClick={handleSave} disabled={saving || !form.name || !form.unit_price || !form.dozen_price}
                className="w-full bg-orange-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ บันทึก'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}