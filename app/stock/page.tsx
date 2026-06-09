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

  // ── Stock Count ──
  const [showStockCount, setShowStockCount] = useState(false)
  const [countCategory, setCountCategory] = useState('')
  const [countSearch, setCountSearch] = useState('')
  const [countValues, setCountValues] = useState<Record<string, string>>({})
  const [savingCount, setSavingCount] = useState(false)

  function openStockCount() {
    setCountValues({})
    setCountCategory('')
    setCountSearch('')
    setShowStockCount(true)
  }

  const countProducts = products
    .filter(p => {
      const matchCat = !countCategory || p.category_id === countCategory
      const matchSearch = !countSearch ||
        p.name.toLowerCase().includes(countSearch.toLowerCase()) ||
        p.code?.toLowerCase().includes(countSearch.toLowerCase())
      return matchCat && matchSearch
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))

  async function handleSaveCount() {
    const diffs = countProducts.filter(p => {
      const val = countValues[p.id]
      return val !== undefined && val !== '' && Number(val) !== p.stock_qty
    })
    if (diffs.length === 0) {
      setShowStockCount(false)
      return
    }
    setSavingCount(true)
    try {
      for (const p of diffs) {
        const actual = Number(countValues[p.id])
        const diff = actual - p.stock_qty
        await supabase.from('stock_movements').insert({
          product_id: p.id,
          type: 'ADJUST',
          quantity: diff,
          unit_cost: p.avg_cost,
          ref_type: 'stock_count',
          note: `เช็คสต๊อก: นับได้ ${actual} (ในระบบ ${p.stock_qty})`,
        })
        await supabase.from('products').update({ stock_qty: actual }).eq('id', p.id)
      }
      setShowStockCount(false)
      fetchData()
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setSavingCount(false)
  }
  const barcodeScannerRef = useRef<any>(null)

  const [form, setForm] = useState({
    name: '',
    barcode: '',
    unit: 'ชิ้น',
    selling_price: '',
    avg_cost: '',
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
      supabase.from('categories').select('*').order('sort_order', { ascending: true }),
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
        avg_cost: Number(form.avg_cost) || 0,
        low_stock_alert: Number(form.low_stock_alert) || 5,
        category_id: form.category_id || null,
        image_url,
        stock_qty: initialStock,
      }).select().single()

      if (!error && newProduct && initialStock > 0) {
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
          name: '', barcode: '', unit: 'ชิ้น', selling_price: '', avg_cost: '',
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
    <main className="min-h-screen bg-[#fff5f3]">

      {/* ══ STICKY HEADER ══ */}
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')}
              className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform">
              ←
            </button>
            <h1 className="text-lg font-bold text-gray-800">📦 คลังสินค้า</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={openStockCount}
              className="bg-white text-orange-400 border border-orange-200 text-xs px-3 py-2.5 rounded-xl font-semibold shadow-sm active:scale-95 transition-transform">
              🔢 เช็คสต๊อก
            </button>
            <button onClick={() => setShowAddProduct(true)}
              className="bg-gradient-to-r from-orange-400 to-rose-400 text-white text-xs px-4 py-2.5 rounded-xl font-semibold shadow-sm active:scale-95 transition-transform">
              + เพิ่มสินค้า
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-white rounded-2xl pl-8 pr-4 py-2.5 text-sm shadow-sm outline-none placeholder-gray-300"
            placeholder="ค้นหาสินค้า หรือ รหัส..." />
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          <button onClick={() => setSelectedCategory('')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
              !selectedCategory
                ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm'
                : 'bg-white text-gray-400 shadow-sm'
            }`}>
            ทั้งหมด
          </button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setSelectedCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                selectedCategory === c.id
                  ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white shadow-sm'
                  : 'bg-white text-gray-400 shadow-sm'
              }`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* ══ PRODUCT GRID ══ */}
      <div className="px-4 pt-2 pb-8">
        {filteredProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">📦</div>
            <p className="text-sm">ยังไม่มีสินค้าค่ะ</p>
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
                  className="absolute top-1.5 right-1.5 bg-red-50 text-red-400 rounded-full w-6 h-6 flex items-center justify-center text-xs z-10 active:scale-95 transition-transform">
                  ✕
                </button>

                {/* กดเข้าดูรายละเอียด */}
                <button onClick={() => router.push(`/stock/${product.id}`)} className="w-full text-left p-2">
                  {/* รูป */}
                  <div className="w-full aspect-square bg-rose-50 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="text-2xl">🐱</span>
                    )}
                  </div>

                  {/* หมวดหมู่ */}
                  {product.categories && (
                    <div className="mb-1">
                      <span className="text-xs bg-rose-50 text-rose-400 px-1.5 py-0.5 rounded-full">
                        {product.categories.name}
                      </span>
                    </div>
                  )}

                  {/* ชื่อ */}
                  <p className="font-semibold text-xs text-gray-800 mb-1 line-clamp-2 min-h-[2rem]">
                    {product.name}
                  </p>

                  {/* ราคา */}
                  <p className="text-rose-500 font-bold text-sm">
                    {product.selling_price.toLocaleString()}฿
                  </p>

                  {/* สต็อก */}
                  <p className={`text-xs mt-0.5 ${
                    product.stock_qty <= product.low_stock_alert
                      ? 'text-red-500 font-bold'
                      : 'text-gray-400'
                  }`}>
                    {product.stock_qty <= product.low_stock_alert ? '⚠️ ' : ''}
                    เหลือ {product.stock_qty} {product.unit}
                  </p>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ ADD PRODUCT MODAL ══ */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-screen overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">เพิ่มสินค้าใหม่</h3>
              <button onClick={() => setShowAddProduct(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="space-y-3">

              {/* รูปสินค้า */}
              <div>
                <label className="text-xs text-gray-400">รูปสินค้า</label>
                <div className="mt-1 w-full h-32 border-2 border-dashed border-rose-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-white"
                  onClick={() => document.getElementById('imageInput')?.click()}>
                  {form.image_preview ? (
                    <img src={form.image_preview} className="w-full h-full object-contain rounded-2xl" />
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
                      maxSizeMB: 0.3, maxWidthOrHeight: 800, useWebWorker: true,
                    })
                    const preview = URL.createObjectURL(compressed)
                    setForm({ ...form, image_preview: preview, image_file: compressed as File })
                  }} />
              </div>

              {/* ชื่อสินค้า */}
              <div>
                <label className="text-xs text-gray-400">ชื่อสินค้า *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm"
                  placeholder="ชื่อสินค้า" />
              </div>

              {/* บาร์โค้ด */}
              <div>
                <label className="text-xs text-gray-400">บาร์โค้ด / รหัสสินค้า</label>
                <div className="flex gap-2 mt-1">
                  <input value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })}
                    className="flex-1 bg-white rounded-2xl px-4 py-3 text-sm outline-none shadow-sm"
                    placeholder="กรอกหรือสแกนบาร์โค้ด" />
                  <button type="button" onClick={startBarcodeScanner}
                    className="bg-gradient-to-r from-orange-400 to-rose-400 text-white px-4 py-3 rounded-2xl text-sm font-semibold active:scale-95 transition-transform">
                    📷
                  </button>
                </div>
              </div>

              {/* หมวดหมู่ */}
              <div>
                <label className="text-xs text-gray-400">หมวดหมู่</label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                  className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm">
                  <option value="">ไม่ระบุ</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* หน่วย */}
              <div>
                <label className="text-xs text-gray-400">หน่วย</label>
                <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm"
                  placeholder="ชิ้น / ซอง / ถุง" />
              </div>

              {/* จำนวนเริ่มต้น */}
              <div>
                <label className="text-xs text-gray-400">จำนวนเริ่มต้น</label>
                <input type="number" value={form.initial_stock}
                  onChange={e => setForm({ ...form, initial_stock: e.target.value })}
                  className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm"
                  placeholder="0" min="0" />
              </div>

              {/* ราคาขาย + ทุน */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400">ราคาขาย (฿)</label>
                  <input type="number" value={form.selling_price}
                    onChange={e => setForm({ ...form, selling_price: e.target.value })}
                    className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm"
                    placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">ราคาทุน (฿)</label>
                  <input type="number" value={form.avg_cost}
                    onChange={e => setForm({ ...form, avg_cost: e.target.value })}
                    className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm"
                    placeholder="0" />
                </div>
              </div>

              {/* แจ้งเตือน */}
              <div>
                <label className="text-xs text-gray-400">แจ้งเตือนเมื่อเหลือ</label>
                <input type="number" value={form.low_stock_alert}
                  onChange={e => setForm({ ...form, low_stock_alert: e.target.value })}
                  className="w-full bg-white rounded-2xl px-4 py-3 text-sm outline-none mt-1 shadow-sm"
                  placeholder="5" />
              </div>
            </div>

            <button onClick={handleAddProduct} disabled={saving || !form.name}
              className="w-full bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold py-4 rounded-2xl mt-4 disabled:opacity-50 active:scale-[0.98] transition-transform">
              {saving ? 'กำลังบันทึก...' : '✅ เพิ่มสินค้า'}
            </button>

            {/* Barcode Scanner */}
            {showBarcodeScanner && (
              <div className="fixed inset-0 bg-black z-[60] flex flex-col">
                <div className="flex justify-between items-center p-4 pt-10">
                  <h3 className="font-bold text-white text-lg">📷 สแกนบาร์โค้ด</h3>
                  <button onClick={stopBarcodeScanner} className="text-white text-2xl">✕</button>
                </div>
                <div id="barcode-reader" className="w-full flex-1" />
                <p className="p-4 text-center text-white/50 text-sm">ส่องกล้องไปที่บาร์โค้ดสินค้าค่ะ</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ STOCK COUNT MODAL ══ */}
      {showStockCount && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl max-h-[92vh] flex flex-col">
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex justify-between items-center px-4 py-2 flex-shrink-0">
              <div>
                <h3 className="font-bold text-lg text-gray-800">🔢 เช็คสต๊อก</h3>
                <p className="text-xs text-gray-400">กรอกจำนวนที่นับได้จริงค่ะ</p>
              </div>
              <button onClick={() => setShowStockCount(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-hide flex-shrink-0">
              <button onClick={() => setCountCategory('')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                  !countCategory ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-white text-gray-400'
                }`}>
                ทั้งหมด
              </button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setCountCategory(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                    countCategory === c.id ? 'bg-gradient-to-r from-orange-400 to-rose-400 text-white' : 'bg-white text-gray-400'
                  }`}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="relative px-4 pb-2 flex-shrink-0">
              <span className="absolute left-7 top-1/2 -translate-y-[60%] text-gray-300 text-sm pointer-events-none">🔍</span>
              <input
                value={countSearch}
                onChange={e => setCountSearch(e.target.value)}
                className="w-full bg-white rounded-2xl pl-8 pr-4 py-2.5 text-sm shadow-sm outline-none placeholder-gray-300"
                placeholder="ค้นหาสินค้า หรือ รหัส..."
              />
            </div>
            {(() => {
              const filled = countProducts.filter(p => countValues[p.id] !== undefined && countValues[p.id] !== '')
              const diffCount = filled.filter(p => Number(countValues[p.id]) !== p.stock_qty).length
              return filled.length > 0 ? (
                <div className="mx-4 mb-2 bg-orange-50 rounded-2xl px-4 py-2 flex justify-between items-center flex-shrink-0">
                  <span className="text-xs text-gray-500">กรอกแล้ว <span className="font-bold text-orange-500">{filled.length}</span> รายการ</span>
                  {diffCount > 0
                    ? <span className="text-xs text-red-500 font-bold">⚠️ ต่างกัน {diffCount} รายการ</span>
                    : <span className="text-xs text-green-500 font-bold">✅ ตรงทั้งหมด</span>
                  }
                </div>
              ) : null
            })()}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
              {countProducts.map(p => {
                const val = countValues[p.id] ?? ''
                const actual = val !== '' ? Number(val) : null
                const diff = actual !== null ? actual - p.stock_qty : null
                const diffColor = diff === null ? '' : diff > 0 ? 'text-green-500' : diff < 0 ? 'text-red-500' : 'text-gray-400'
                const diffText = diff === null ? '' : diff > 0 ? `+${diff}` : `${diff}`
                const borderColor = diff === null ? 'border-transparent' : diff !== 0 ? 'border-orange-300' : 'border-green-300'
                return (
                  <div key={p.id} className={`bg-white rounded-2xl px-3 py-2.5 flex items-center gap-3 border-2 ${borderColor} transition-all`}>
                    <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-0.5" />
                        : <span className="text-lg">🐱</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 line-clamp-1">{p.name}</p>
                      <p className="text-xs text-gray-400">ในระบบ: <span className="font-bold text-gray-600">{p.stock_qty}</span> {p.unit}</p>
                    </div>
                    <div className="w-10 text-center flex-shrink-0">
                      {diff !== null && diff !== 0 && <span className={`text-xs font-bold ${diffColor}`}>{diffText}</span>}
                      {diff === 0 && <span className="text-xs text-green-400">✓</span>}
                    </div>
                    <input
                      type="number"
                      value={val}
                      onChange={e => setCountValues(prev => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-16 bg-[#fff5f3] border border-rose-100 rounded-xl px-2 py-1.5 text-sm text-center outline-none focus:border-orange-400 flex-shrink-0"
                      placeholder={`${p.stock_qty}`}
                      min="0"
                    />
                  </div>
                )
              })}
            </div>
            <div className="px-4 pb-6 pt-2 flex-shrink-0">
              {(() => {
                const diffCount = countProducts.filter(p =>
                  countValues[p.id] !== undefined && countValues[p.id] !== '' && Number(countValues[p.id]) !== p.stock_qty
                ).length
                return (
                  <button onClick={handleSaveCount} disabled={savingCount}
                    className="w-full bg-gradient-to-r from-orange-400 to-rose-500 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-[0.98] transition-transform">
                    {savingCount ? 'กำลังบันทึก...' : diffCount > 0 ? `✅ ปรับยอด ${diffCount} รายการ` : '✅ ยืนยัน (ยอดตรงทั้งหมด)'}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}

    </main>
  )
}