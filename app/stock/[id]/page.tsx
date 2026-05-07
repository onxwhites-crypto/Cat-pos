'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import imageCompression from 'browser-image-compression'

type Category = { id: string; name: string }
type Product = {
  id: string; name: string; code: string; barcode: string; unit: string
  selling_price: number; avg_cost: number; stock_qty: number
  low_stock_alert: number; image_url: string | null
  category_id: string; categories: { name: string } | null
}
type Movement = {
  id: string; type: string; quantity: number; unit_cost: number
  ref_type: string; note: string; created_at: string
}

export default function ProductDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustType, setAdjustType] = useState<'IN' | 'OUT'>('IN')
  const [adjustNote, setAdjustNote] = useState('')
  const [showAllMovements, setShowAllMovements] = useState(false)

  const [form, setForm] = useState({
    name: '', barcode: '', unit: 'ชิ้น', selling_price: '', avg_cost: '',
    low_stock_alert: '5', category_id: '', image_preview: '', image_file: null as File | null,
  })

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    const [{ data: p }, { data: m }, { data: c }] = await Promise.all([
      supabase.from('products').select('*, categories(name)').eq('id', id).single(),
      supabase.from('stock_movements').select('*').eq('product_id', id).order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
    ])
    setProduct(p)
    setMovements(m || [])
    setCategories(c || [])
    if (p) {
      setForm({
        name: p.name || '',
        barcode: p.barcode || p.code || '',
        unit: p.unit || 'ชิ้น',
        selling_price: p.selling_price?.toString() || '',
        avg_cost: p.avg_cost?.toString() || '',
        low_stock_alert: p.low_stock_alert?.toString() || '5',
        category_id: p.category_id || '',
        image_preview: p.image_url || '',
        image_file: null,
      })
    }
    setLoading(false)
  }

  async function handleAdjustStock() {
    if (!product || !adjustQty || Number(adjustQty) <= 0) return
    setSaving(true)
    try {
      const qty = Number(adjustQty)
      const newStock = adjustType === 'IN' ? product.stock_qty + qty : Math.max(0, product.stock_qty - qty)
      await supabase.from('products').update({ stock_qty: newStock }).eq('id', product.id)
      await supabase.from('stock_movements').insert({
        product_id: product.id, type: adjustType, quantity: qty, unit_cost: 0,
        ref_type: 'manual', note: adjustNote || (adjustType === 'IN' ? 'เพิ่มสต็อกด้วยตนเอง' : 'ลดสต็อกด้วยตนเอง'),
      })
      setShowAdjust(false); setAdjustQty(''); setAdjustNote(''); fetchData()
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  async function handleSave() {
    if (!form.name || !product) return
    setSaving(true)
    try {
      let image_url = product.image_url
      if (form.image_file) {
        const fileExt = form.image_file.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`
        const { data: uploadData } = await supabase.storage.from('products').upload(fileName, form.image_file)
        if (uploadData) {
          const { data: urlData } = supabase.storage.from('products').getPublicUrl(fileName)
          image_url = urlData.publicUrl
        }
      }
      const { error } = await supabase.from('products').update({
        name: form.name,
        code: form.barcode || null,
        barcode: form.barcode || null,
        unit: form.unit,
        selling_price: Number(form.selling_price) || 0,
        avg_cost: Number(form.avg_cost) || 0,
        low_stock_alert: Number(form.low_stock_alert) || 5,
        category_id: form.category_id || null,
        image_url,
      }).eq('id', product.id)
      if (!error) { setShowEdit(false); fetchData() }
    } catch (e) { alert('เกิดข้อผิดพลาดค่ะ') }
    setSaving(false)
  }

  if (loading) return <main className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">กำลังโหลด...</p></main>
  if (!product) return <main className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-400">ไม่พบสินค้าค่ะ</p></main>

  const displayMovements = showAllMovements ? movements : movements.slice(0, 20)

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">รายละเอียดสินค้า</h1>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <div className="w-full h-48 bg-gray-100 rounded-xl mb-4 flex items-center justify-center overflow-hidden">
            {product.image_url ? <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-2" /> : <span className="text-6xl">🐱</span>}
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{product.name}</h2>
          {product.categories && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">{product.categories.name}</span>}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => setShowAdjust(true)} className="bg-green-500 text-white font-bold py-3 rounded-2xl text-sm">📦 ปรับสต็อก</button>
          <button onClick={() => setShowEdit(true)} className="bg-blue-500 text-white font-bold py-3 rounded-2xl text-sm">✏️ แก้ไขสินค้า</button>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <h3 className="font-bold text-gray-700 mb-3">ข้อมูลสินค้า</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">รหัส / บาร์โค้ด</span>
              <span className="text-sm font-medium">{product.code || product.barcode || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">หน่วย</span>
              <span className="text-sm font-medium">{product.unit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">ราคาขาย</span>
              <span className="text-sm font-bold text-blue-500">{product.selling_price.toLocaleString()}฿</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">ต้นทุนเฉลี่ย</span>
              <span className="text-sm font-medium text-red-500">{product.avg_cost.toFixed(2)}฿</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">กำไรต่อชิ้น</span>
              <span className={`text-sm font-bold ${product.selling_price - product.avg_cost >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {(product.selling_price - product.avg_cost).toFixed(2)}฿
              </span>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl p-4 shadow-sm mb-3 ${product.stock_qty <= product.low_stock_alert ? 'bg-red-50' : 'bg-white'}`}>
          <h3 className="font-bold text-gray-700 mb-3">สต็อกคงเหลือ</h3>
          <div className="flex justify-between items-center">
            <div>
              <div className={`text-3xl font-bold ${product.stock_qty <= product.low_stock_alert ? 'text-red-500' : 'text-gray-800'}`}>
                {product.stock_qty} {product.unit}
              </div>
              {product.stock_qty <= product.low_stock_alert && <div className="text-xs text-red-400 mt-1">⚠️ ใกล้หมดแล้วค่ะ!</div>}
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">แจ้งเตือนเมื่อเหลือ</div>
              <div className="text-sm font-medium">{product.low_stock_alert} {product.unit}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-700">ประวัติรับเข้า-จ่ายออก</h3>
            {movements.length > 20 && (
              <button onClick={() => setShowAllMovements(!showAllMovements)} className="text-xs text-blue-500">
                {showAllMovements ? 'ย่อ' : `ดูทั้งหมด (${movements.length})`}
              </button>
            )}
          </div>
          {movements.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีประวัติค่ะ</p>
          ) : (
            <div className="space-y-2">
              {displayMovements.map(m => (
                <div key={m.id} className="flex justify-between items-center py-2 border-b border-gray-50">
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.type === 'IN' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                      {m.type === 'IN' ? '📥 รับเข้า' : '📤 จ่ายออก'}
                    </span>
                    {m.note && <div className="text-xs text-gray-400 mt-1">{m.note}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(m.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold text-sm ${m.type === 'IN' ? 'text-green-500' : 'text-red-500'}`}>
                      {m.type === 'IN' ? '+' : '-'}{m.quantity} {product.unit}
                    </div>
                    {m.unit_cost > 0 && <div className="text-xs text-gray-400">ต้นทุน {m.unit_cost.toFixed(2)}฿/ชิ้น</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adjust Stock Modal */}
        {showAdjust && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">📦 ปรับสต็อก</h3>
                <button onClick={() => setShowAdjust(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">ประเภท</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button onClick={() => setAdjustType('IN')} className={`py-2 rounded-xl text-sm font-medium ${adjustType === 'IN' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>📥 เพิ่มสต็อก</button>
                    <button onClick={() => setAdjustType('OUT')} className={`py-2 rounded-xl text-sm font-medium ${adjustType === 'OUT' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>📤 ลดสต็อก</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">จำนวน ({product.unit})</label>
                  <input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
                    autoFocus min="1" className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="0" />
                </div>
                {adjustQty && Number(adjustQty) > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 text-sm">
                    <span className="text-gray-500">สต็อกหลังปรับ: </span>
                    <span className="font-bold">
                      {adjustType === 'IN' ? product.stock_qty + Number(adjustQty) : Math.max(0, product.stock_qty - Number(adjustQty))} {product.unit}
                    </span>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500">หมายเหตุ</label>
                  <input value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="เช่น นับสต็อก, ของหาย..." />
                </div>
              </div>
              <button onClick={handleAdjustStock} disabled={saving || !adjustQty || Number(adjustQty) <= 0}
                className="w-full bg-green-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ บันทึกการปรับสต็อก'}
              </button>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEdit && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-screen overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">แก้ไขสินค้า</h3>
                <button onClick={() => setShowEdit(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">รูปสินค้า</label>
                  <div className="mt-1 w-full h-32 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer overflow-hidden"
                    onClick={() => document.getElementById('editImageInput')?.click()}>
                    {form.image_preview ? <img src={form.image_preview} className="w-full h-full object-contain rounded-xl" /> : (
                      <><div className="text-2xl mb-1">📷</div><div className="text-xs text-gray-400">กดเพื่อเปลี่ยนรูป</div></>
                    )}
                  </div>
                  <input id="editImageInput" type="file" accept="image/*" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const compressed = await imageCompression(file, { maxSizeMB: 0.3, maxWidthOrHeight: 800, useWebWorker: true })
                      setForm({ ...form, image_preview: URL.createObjectURL(compressed), image_file: compressed as File })
                    }} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">ชื่อสินค้า *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="ชื่อสินค้า" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">บาร์โค้ด / รหัสสินค้า</label>
                  <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="บาร์โค้ด" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">หมวดหมู่</label>
                    <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                      <option value="">ไม่ระบุ</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">หน่วย</label>
                    <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                      <option>ชิ้น</option><option>ถุง</option><option>กล่อง</option>
                      <option>แพ็ค</option><option>โหล</option><option>ซอง</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">ราคาขาย (฿)</label>
                    <input type="number" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">ราคาทุน (฿)</label>
                    <input type="number" value={form.avg_cost} onChange={e => setForm({ ...form, avg_cost: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">แจ้งเตือนเมื่อเหลือ</label>
                  <input type="number" value={form.low_stock_alert} onChange={e => setForm({ ...form, low_stock_alert: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm" placeholder="5" />
                </div>
              </div>
              <button onClick={handleSave} disabled={saving || !form.name}
                className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}