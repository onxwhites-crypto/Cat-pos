'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type PreviewRow = {
  name: string
  selling_price: number
  stock_qty: number
  category: string
  barcode: string
  status: 'ready' | 'error' | 'duplicate'
  error?: string
}

export default function ImportPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [importResult, setImportResult] = useState({ success: 0, error: 0 })

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setPreview([])
    setDone(false)

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws) as any[]
        console.log('rows sample:', JSON.stringify(rows[0]))

      // ดึงข้อมูลที่มีอยู่แล้ว
      const { data: existingProducts } = await supabase
        .from('products')
        .select('name, barcode, code')
        .eq('is_active', true)

      const existingNames = new Set(existingProducts?.map(p => p.name.toLowerCase()) || [])
      const existingBarcodes = new Set(
        existingProducts?.flatMap(p => [p.barcode, p.code]).filter(Boolean).map(b => b?.toLowerCase()) || []
      )

      const previewRows: PreviewRow[] = rows.map((row, i) => {
        const name = String(row['ชื่อสินค้า'] || row['name'] || '').trim()
        const selling_price = Number(row['ราคาขาย'] || row['price'] || row['selling_price'] || 0)
        const stock_qty = Number(row['จำนวน'] || row['stock'] || row['stock_qty'] || 0)
        const category = String(row['หมวดหมู่'] || row['category'] || '').trim()
        const barcode = String(row['บาร์โค้ด'] || row['barcode'] || row['code'] || '').trim()

        if (!name) {
          return { name, selling_price, stock_qty, category, barcode, status: 'error', error: 'ไม่มีชื่อสินค้า' }
        }

        if (existingNames.has(name.toLowerCase())) {
          return { name, selling_price, stock_qty, category, barcode, status: 'duplicate', error: 'มีสินค้านี้แล้ว' }
        }

        if (barcode && existingBarcodes.has(barcode.toLowerCase())) {
          return { name, selling_price, stock_qty, category, barcode, status: 'duplicate', error: 'บาร์โค้ดซ้ำ' }
        }

        return { name, selling_price, stock_qty, category, barcode, status: 'ready' }
      })

      setPreview(previewRows)
    } catch (e) {
      alert('ไม่สามารถอ่านไฟล์ได้ค่ะ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx หรือ .csv ค่ะ')
    }
    setLoading(false)
  }

  async function handleImport() {
    const readyRows = preview.filter(r => r.status === 'ready')
    if (readyRows.length === 0) return

    setImporting(true)
    let success = 0
    let error = 0

    // ดึง categories
    const { data: categories } = await supabase.from('categories').select('id, name')
    const categoryMap = new Map(categories?.map(c => [c.name.toLowerCase(), c.id]) || [])

    for (const row of readyRows) {
      try {
        const categoryId = categoryMap.get(row.category.toLowerCase()) || null

        const { data: product } = await supabase.from('products').insert({
          name: row.name,
          code: row.barcode || null,
          barcode: row.barcode || null,
          unit: 'ชิ้น',
          selling_price: row.selling_price,
          avg_cost: 0,
          stock_qty: row.stock_qty,
          low_stock_alert: 5,
          category_id: categoryId,
          is_active: true,
        }).select().single()

        if (product && row.stock_qty > 0) {
          await supabase.from('stock_movements').insert({
            product_id: product.id,
            type: 'IN',
            quantity: row.stock_qty,
            unit_cost: 0,
            ref_type: 'initial',
            note: 'นำเข้าจาก Excel',
          })
        }

        success++
      } catch (e) {
        error++
      }
    }

    setImportResult({ success, error })
    setDone(true)
    setImporting(false)
  }

  const readyCount = preview.filter(r => r.status === 'ready').length
  const duplicateCount = preview.filter(r => r.status === 'duplicate').length
  const errorCount = preview.filter(r => r.status === 'error').length

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
          <h1 className="text-xl font-bold text-gray-800">📥 Import สินค้า</h1>
        </div>

        {/* คำอธิบาย */}
        <div className="bg-blue-50 rounded-2xl p-4 shadow-sm mb-3">
          <h3 className="font-bold text-blue-700 mb-2">📋 รูปแบบ Excel ที่รองรับค่ะ</h3>
          <div className="text-xs text-blue-600 space-y-1">
            <div>Column ที่ต้องมี:</div>
            <div className="font-mono bg-white rounded-lg p-2 text-gray-700 space-y-0.5">
              <div>• <span className="font-bold">ชื่อสินค้า</span> (จำเป็น)</div>
              <div>• <span className="font-bold">ราคาขาย</span></div>
              <div>• <span className="font-bold">จำนวน</span> (stock เริ่มต้น)</div>
              <div>• <span className="font-bold">หมวดหมู่</span></div>
              <div>• <span className="font-bold">บาร์โค้ด</span></div>
            </div>
          </div>
        </div>

        {/* Upload */}
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
            onChange={handleFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 text-center">
            <div className="text-3xl mb-2">📂</div>
            <div className="font-bold text-gray-700">กดเพื่อเลือกไฟล์</div>
            <div className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv</div>
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center text-gray-400 py-4">
            กำลังอ่านไฟล์...
          </div>
        )}

        {/* Preview */}
        {preview.length > 0 && !done && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-green-500">{readyCount}</div>
                <div className="text-xs text-green-600">พร้อม import</div>
              </div>
              <div className="bg-yellow-50 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-yellow-500">{duplicateCount}</div>
                <div className="text-xs text-yellow-600">ซ้ำในระบบ</div>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-red-500">{errorCount}</div>
                <div className="text-xs text-red-600">error</div>
              </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 font-bold text-sm text-gray-700">
                ตัวอย่างข้อมูล ({preview.length} รายการ)
              </div>
              <div className="max-h-64 overflow-y-auto">
                {preview.map((row, i) => (
                  <div key={i}
                    className={`px-4 py-2.5 border-b border-gray-50 last:border-0 flex justify-between items-center ${
                      row.status === 'error' ? 'bg-red-50' :
                      row.status === 'duplicate' ? 'bg-yellow-50' : ''
                    }`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{row.name || '-'}</div>
                      <div className="text-xs text-gray-400">
                        {row.selling_price}฿ · {row.stock_qty} ชิ้น
                        {row.category ? ` · ${row.category}` : ''}
                      </div>
                      {row.error && (
                        <div className="text-xs text-red-500 mt-0.5">{row.error}</div>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                      row.status === 'ready' ? 'bg-green-100 text-green-600' :
                      row.status === 'duplicate' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                      {row.status === 'ready' ? '✓' :
                       row.status === 'duplicate' ? 'ซ้ำ' : '!'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Import Button */}
            {readyCount > 0 && (
              <button onClick={handleImport} disabled={importing}
                className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl disabled:opacity-50 mb-3">
                {importing ? 'กำลัง import...' : `✅ Import ${readyCount} รายการ`}
              </button>
            )}

            <button onClick={() => { setPreview([]); if (fileRef.current) fileRef.current.value = '' }}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-2xl mb-4">
              ยกเลิก
            </button>
          </>
        )}

        {/* Done */}
        {done && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center mb-4">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="font-bold text-lg text-gray-800 mb-2">Import เสร็จแล้วค่ะ!</h3>
            <div className="text-green-500 font-bold text-2xl mb-1">
              +{importResult.success} รายการ
            </div>
            {importResult.error > 0 && (
              <div className="text-red-400 text-sm mb-3">
                ล้มเหลว {importResult.error} รายการ
              </div>
            )}
            <button onClick={() => router.push('/stock')}
              className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl mt-4">
              ดูคลังสินค้า →
            </button>
          </div>
        )}

      </div>
    </main>
  )
}