'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import imageCompression from 'browser-image-compression'

type Category = { id: string; name: string }
type Product = {
  id: string
  name: string
  code: string
  unit: string
  selling_price: number
  avg_cost: number
  stock_qty: number
  low_stock_alert: number
  image_url: string | null
  is_active: boolean
  category_id: string
  categories: { name: string } | null
}

export default function StockPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [search, setSearch] = useState('')
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const barcodeScannerRef = useRef<any>(null)

const [form, setForm] = useState({
  name: '',
  barcode: '',
  unit: 'ชิ้น',
  selling_price: '',
  low_stock_alert: '5',
  category_id: '',
  image_preview: '',
  image_file: null as File | null,
  initial_stock: '0',
})

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('products').select('*, categories(name)').eq('is_active', true).order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setProducts(p || [])
    setCategories(c || [])
  }

const filteredProducts = products
  .filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !selectedCategory || p.category_id === selectedCategory
    return matchSearch && matchCategory
  })
  .sort((a, b) => {
    // มีของก่อน ไม่มีทีหลัง
    if (a.stock_qty > 0 && b.stock_qty <= 0) return -1
    if (a.stock_qty <= 0 && b.stock_qty > 0) return 1
    return 0
  })

async function startBarcodeScanner() {
  setShowBarcodeScanner(true)
  setTimeout(async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('barcode-reader')
      barcodeScannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText: string) => {
          setForm(prev => ({ ...prev, barcode: decodedText }))
          stopBarcodeScanner()
        },
        () => {}
      )
    } catch (e) {
      stopBarcodeScanner()
    }
  }, 100)
}

async function stopBarcodeScanner() {
  try {
    if (barcodeScannerRef.current) {
      await barcodeScannerRef.current.stop()
      barcodeScannerRef.current = null
    }
  } catch (e) {}
  setShowBarcodeScanner(false)
}

async function handleAddProduct() {
  if (!form.name) return
  setSaving(true)
  try {
    let image_url = null
    if (form.image_file) {
      const fileExt = form.image_file.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const { data: uploadData } = await supabase.storage
        .from('products').upload(fileName, form.image_file)
      if (uploadData) {
        const { data: urlData } = supabase.storage.from('products').getPublicUrl(fileName)
        image_url = urlData.publicUrl
      }
    }

    const initialStock = Number(form.initial_stock) || 0

    const { data: newProduct, error } = await supabase.from('products').insert({
      name: form.name,
      code: form.barcode || null,
      barcode: form.barcode || null,
      unit: form.unit,
      selling_price: Number(form.selling_price) || 0,
      low_stock_alert: Number(form.low_stock_alert) || 5,
      category_id: form.category_id || null,
      image_url,
      stock_qty: initialStock,
    }).select().single()

    if (!error && newProduct && initialStock > 0) {
      // บันทึก stock_movement
      await supabase.from('stock_movements').insert({
        product_id: newProduct.id,
        type: 'IN',
        quantity: initialStock,
        unit_cost: 0,
        ref_type: 'initial',
        note: 'สต็อกเริ่มต้น',
      })
    }

    if (!error) {
      setForm({
        name: '', barcode: '', unit: 'ชิ้น', selling_price: '',
        low_stock_alert: '5', category_id: '', image_preview: '',
        image_file: null, initial_stock: '0',
      })
      setShowAddProduct(false)
      fetchData()
    }
  } catch (e) {
    alert('เกิดข้อผิดพลาดค่ะ')
  }
  setSaving(false)
}

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
            <h1 className="text-xl font-bold text-gray-800">📦 คลังสินค้า</h1>
          </div>
          <button onClick={() => setShowAddProduct(true)}
            className="bg-blue-500 text-white text-sm px-3 py-2 rounded-xl">
            + เพิ่มสินค้า
          </button>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-2 text-sm"
            placeholder="🔍 ค้นหาสินค้า..." />
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button onClick={() => setSelectedCategory('')}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${!selectedCategory ? 'bg-blue-500 text-white' : 'bg-white text-gray-600'}`}>
            ทั้งหมด
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${selectedCategory === c.id ? 'bg-blue-500 text-white' : 'bg-white text-gray-600'}`}>
              {c.name}
            </button>
          ))}
        </div>

{filteredProducts.length === 0 ? (
  <div className="text-center text-gray-400 py-12">
    <div className="text-4xl mb-2">📦</div>
    <p>ยังไม่มีสินค้าค่ะ</p>
  </div>
) : (
  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
    {filteredProducts.map(product => (
      <div key={product.id} className="bg-white rounded-2xl shadow-sm relative overflow-hidden">

        {/* ปุ่มลบ */}
        <button
          onClick={async () => {
            if (!confirm(`ลบ "${product.name}" ออกจากระบบ?`)) return
            await supabase.from('products').update({ is_active: false }).eq('id', product.id)
            fetchData()
          }}
          className="absolute top-1 right-1 bg-red-100 text-red-500 rounded-full w-6 h-6 flex items-center justify-center text-xs z-10">
          ✕
        </button>

        {/* กดเข้าดูรายละเอียด */}
        <button onClick={() => router.push(`/stock/${product.id}`)} className="w-full text-left p-2">
          {/* รูป */}
          <div className="w-full aspect-square bg-gray-100 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name}
                className="w-full h-full object-contain p-1" />
            ) : (
              <span className="text-2xl">🐱</span>
            )}
          </div>

          {/* หมวดหมู่ */}
          {product.categories && (
            <div className="mb-1">
              <span className="text-xs bg-blue-100 text-blue-500 px-1.5 py-0.5 rounded-full">
                {product.categories.name}
              </span>
            </div>
          )}

          {/* ชื่อ */}
          <div className="font-medium text-xs text-gray-800 mb-1 line-clamp-2 min-h-[2rem]">
            {product.name}
          </div>

          {/* ราคา */}
          <div className="text-blue-500 font-bold text-sm">
            {product.selling_price.toLocaleString()}฿
          </div>

          {/* สต็อก */}
          <div className={`text-xs mt-0.5 ${
            product.stock_qty <= product.low_stock_alert
              ? 'text-red-500 font-bold'
              : 'text-gray-400'
          }`}>
            {product.stock_qty <= product.low_stock_alert ? '⚠️ ' : ''}
            เหลือ {product.stock_qty} {product.unit}
          </div>
        </button>

      </div>
    ))}
  </div>
)}

        {/* Add Product Modal */}
        {showAddProduct && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-2xl p-4 max-h-screen overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">เพิ่มสินค้าใหม่</h3>
                <button onClick={() => setShowAddProduct(false)} className="text-gray-400 text-xl">✕</button>
              </div>

              <div className="space-y-3">

                {/* รูปสินค้า */}
                <div>
                  <label className="text-xs text-gray-500">รูปสินค้า</label>
                  <div className="mt-1 w-full h-32 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer overflow-hidden"
                    onClick={() => document.getElementById('imageInput')?.click()}>
                    {form.image_preview ? (
                      <img src={form.image_preview} className="w-full h-full object-contain rounded-xl" />
                    ) : (
                      <>
                        <div className="text-2xl mb-1">📷</div>
                        <div className="text-xs text-gray-400">กดเพื่ออัพโหลดรูป</div>
                      </>
                    )}
                  </div>
                  <input id="imageInput" type="file" accept="image/*" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const compressed = await imageCompression(file, {
                        maxSizeMB: 0.3,
                        maxWidthOrHeight: 800,
                        useWebWorker: true,
                      })
                      const preview = URL.createObjectURL(compressed)
                      setForm({ ...form, image_preview: preview, image_file: compressed as File })
                    }} />
                </div>

                {/* ชื่อสินค้า */}
                <div>
                  <label className="text-xs text-gray-500">ชื่อสินค้า *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="ชื่อสินค้า" />
                </div>

{/* บาร์โค้ด */}
<div>
  <label className="text-xs text-gray-500">บาร์โค้ด / รหัสสินค้า</label>
  <div className="flex gap-2 mt-1">
    <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })}
      className="flex-1 border border-gray-200 rounded-xl p-2 text-sm"
      placeholder="กรอกหรือสแกนบาร์โค้ด" />
    <button type="button" onClick={startBarcodeScanner}
      className="bg-orange-500 text-white px-3 py-2 rounded-xl text-sm">
      📷
    </button>
  </div>
</div>

                {/* หมวดหมู่ */}
                <div>
                  <label className="text-xs text-gray-500">หมวดหมู่</label>
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                    <option value="">ไม่ระบุ</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                
{/* จำนวนเริ่มต้น */}
<div>
  <label className="text-xs text-gray-500">จำนวนเริ่มต้น</label>
  <input type="number" value={form.initial_stock}
    onChange={e => setForm({ ...form, initial_stock: e.target.value })}
    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
    placeholder="0" min="0" />
</div>

                {/* ราคาขาย + แจ้งเตือน */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">ราคาขาย (฿)</label>
                    <input type="number" value={form.selling_price}
                      onChange={e => setForm({ ...form, selling_price: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">แจ้งเตือนเมื่อเหลือ</label>
                    <input type="number" value={form.low_stock_alert}
                      onChange={e => setForm({ ...form, low_stock_alert: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                      placeholder="5" />
                  </div>
                </div>


              </div>

              <button onClick={handleAddProduct} disabled={saving || !form.name}
                className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : '✅ เพิ่มสินค้า'}
              </button>

              {/* Barcode Scanner */}
{showBarcodeScanner && (
  <div className="fixed inset-0 bg-black z-[60] flex flex-col">
    <div className="flex justify-between items-center p-4">
      <h3 className="font-bold text-white text-lg">📷 สแกนบาร์โค้ด</h3>
      <button onClick={stopBarcodeScanner} className="text-white text-2xl">✕</button>
    </div>
    <div id="barcode-reader" className="w-full flex-1" />
    <div className="p-4 text-center text-white text-sm opacity-70">
      ส่องกล้องไปที่บาร์โค้ดสินค้าค่ะ
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
