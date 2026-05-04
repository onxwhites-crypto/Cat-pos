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
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
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

      const { data: existingProducts } = await supabase
        .from('products').select('name, barcode, code').eq('is_active', true)

      const existingNames = new Set(existingProducts?.map(p => p.name.toLowerCase()) || [])
      const existingBarcodes = new Set(
        existingProducts?.flatMap(p => [p.barcode, p.code]).filter(Boolean).map(b => b?.toLowerCase()) || []
      )

      const previewRows: PreviewRow[] = rows.map((row) => {
        const name = String(row['ชื่อสินค้า'] || row['name'] || '').trim()
        const selling_price = Number(row['ราคาขาย'] || row['price'] || 0)
        const stock_qty = Number(row['จำนวน'] || row['stock'] || 0)
        const category = String(row['หมวดหมู่'] || row['category'] || '').trim()
        const barcode = String(row['บาร์โค้ด'] || row['barcode'] || '').trim()

        if (!name) return { name, selling_price, stock_qty, category, barcode, status: 'error' as const, error: 'ไม่มีชื่อสินค้า' }
        if (existingNames.has(name.toLowerCase())) return { name, selling_price, stock_qty, category, barcode, status: 'duplicate' as const, error: 'มีสินค้านี้แล้ว' }
        if (barcode && existingBarcodes.has(barcode.toLowerCase())) return { name, selling_price, stock_qty, category, barcode, status: 'duplicate' as const, error: 'บาร์โค้ดซ้ำ' }
        return { name, selling_price, stock_qty, category, barcode, status: 'ready' as const }
      })

      setPreview(previewRows)
    } catch (e) {
      alert('ไม่สามารถอ่านไฟล์ได้ค่ะ')
    }
    setLoading(false)
  }

  async function handleImport() {
    const readyRows = preview.filter(r => r.status === 'ready')
    if (readyRows.length === 0) return
    setImporting(true)
    let success = 0, error = 0

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
      } catch (e) { error++ }
    }

    setImportResult({ success, error })
    setDone(true)
    setImporting(false)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const XLSX = await import('xlsx')

      // ดึงข้อมูลทั้งหมด
      const [
        { data: products },
        { data: orders },
        { data: customers },
      ] = await Promise.all([
        supabase.from('products').select('*, categories(name)').eq('is_active', true).order('name'),
        supabase.from('orders').select('*, order_items(quantity, unit_price, products(name)), customers(name)').order('order_date', { ascending: false }),
        supabase.from('customers').select('*, zones(name)').order('name'),
      ])

      const wb = XLSX.utils.book_new()

      // Sheet 1: สินค้า
      const productRows = (products || []).map((p: any) => ({
        'ชื่อสินค้า': p.name,
        'ราคาขาย': p.selling_price,
        'ต้นทุนเฉลี่ย': p.avg_cost,
        'จำนวนคงเหลือ': p.stock_qty,
        'แจ้งเตือนเมื่อเหลือ': p.low_stock_alert,
        'หมวดหมู่': p.categories?.name || '',
        'บาร์โค้ด': p.barcode || p.code || '',
        'หน่วย': p.unit,
      }))
      const ws1 = XLSX.utils.json_to_sheet(productRows)
      ws1['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 8 }]
      XLSX.utils.book_append_sheet(wb, ws1, 'สินค้า')

      // Sheet 2: ประวัติการขาย
      const orderRows: any[] = []
      ;(orders || []).forEach((o: any) => {
        o.order_items?.forEach((item: any) => {
          orderRows.push({
            'วันที่': new Date(o.order_date).toLocaleDateString('th-TH'),
            'ลูกค้า': o.customers?.name || 'ลูกค้าทั่วไป',
            'สินค้า': item.products?.name || '',
            'จำนวน': item.quantity,
            'ราคา/ชิ้น': item.unit_price,
            'ยอดรวม': item.quantity * item.unit_price,
            'สถานะชำระ': o.payment_status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ',
            'วิธีชำระ': o.payment_method === 'cash' ? 'เงินสด' : o.payment_method === 'transfer' ? 'โอน' : '',
          })
        })
      })
      const ws2 = XLSX.utils.json_to_sheet(orderRows)
      ws2['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 35 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'ประวัติการขาย')

      // Sheet 3: ลูกค้า
      const customerRows = (customers || []).map((c: any) => ({
        'ชื่อ': c.name,
        'เบอร์โทร': c.phone || '',
        'โซน': (c as any).zones?.name || '',
        'ที่อยู่': c.address || '',
        'วันที่เพิ่ม': new Date(c.created_at).toLocaleDateString('th-TH'),
      }))
      const ws3 = XLSX.utils.json_to_sheet(customerRows)
      ws3['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, ws3, 'ลูกค้า')

      // Download
      const date = new Date().toLocaleDateString('th-TH').replace(/\//g, '-')
      XLSX.writeFile(wb, `backup_${date}.xlsx`)
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setExporting(false)
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
          <h1 className="text-xl font-bold text-gray-800">📦 Import / Export</h1>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setActiveTab('import')}
            className={`py-2 rounded-xl text-sm font-bold ${activeTab === 'import' ? 'bg-blue-500 text-white' : 'bg-white text-gray-600'}`}>
            📥 Import สินค้า
          </button>
          <button onClick={() => setActiveTab('export')}
            className={`py-2 rounded-xl text-sm font-bold ${activeTab === 'export' ? 'bg-green-500 text-white' : 'bg-white text-gray-600'}`}>
            📤 Export ข้อมูล
          </button>
        </div>

        {/* Import Tab */}
        {activeTab === 'import' && (
          <>
            <div className="bg-blue-50 rounded-2xl p-4 shadow-sm mb-3">
              <h3 className="font-bold text-blue-700 mb-2">📋 รูปแบบ Excel ที่รองรับค่ะ</h3>
              <div className="font-mono bg-white rounded-lg p-2 text-gray-700 text-xs space-y-0.5">
                <div>• <span className="font-bold">ชื่อสินค้า</span> (จำเป็น)</div>
                <div>• <span className="font-bold">ราคาขาย</span></div>
                <div>• <span className="font-bold">จำนวน</span> (stock เริ่มต้น)</div>
                <div>• <span className="font-bold">หมวดหมู่</span></div>
                <div>• <span className="font-bold">บาร์โค้ด</span></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-3">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 text-center">
                <div className="text-3xl mb-2">📂</div>
                <div className="font-bold text-gray-700">กดเพื่อเลือกไฟล์</div>
                <div className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv</div>
              </button>
            </div>

            {loading && <p className="text-center text-gray-400 py-4">กำลังอ่านไฟล์...</p>}

            {preview.length > 0 && !done && (
              <>
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

                <div className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 font-bold text-sm text-gray-700">
                    ตัวอย่างข้อมูล ({preview.length} รายการ)
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {preview.map((row, i) => (
                      <div key={i} className={`px-4 py-2.5 border-b border-gray-50 last:border-0 flex justify-between items-center ${
                        row.status === 'error' ? 'bg-red-50' : row.status === 'duplicate' ? 'bg-yellow-50' : ''
                      }`}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{row.name || '-'}</div>
                          <div className="text-xs text-gray-400">
                            {row.selling_price}฿ · {row.stock_qty} ชิ้น
                            {row.category ? ` · ${row.category}` : ''}
                          </div>
                          {row.error && <div className="text-xs text-red-500 mt-0.5">{row.error}</div>}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                          row.status === 'ready' ? 'bg-green-100 text-green-600' :
                          row.status === 'duplicate' ? 'bg-yellow-100 text-yellow-600' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {row.status === 'ready' ? '✓' : row.status === 'duplicate' ? 'ซ้ำ' : '!'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {readyCount > 0 && (
                  <button onClick={handleImport} disabled={importing}
                    className="w-full bg-blue-500 text-white font-bold py-4 rounded-2xl disabled:opacity-50 mb-2">
                    {importing ? 'กำลัง import...' : `✅ Import ${readyCount} รายการ`}
                  </button>
                )}
                <button onClick={() => { setPreview([]); if (fileRef.current) fileRef.current.value = '' }}
                  className="w-full bg-gray-100 text-gray-600 py-3 rounded-2xl mb-4">
                  ยกเลิก
                </button>
              </>
            )}

            {done && (
              <div className="bg-white rounded-2xl p-6 shadow-sm text-center mb-4">
                <div className="text-4xl mb-3">🎉</div>
                <h3 className="font-bold text-lg text-gray-800 mb-2">Import เสร็จแล้วค่ะ!</h3>
                <div className="text-green-500 font-bold text-2xl mb-1">+{importResult.success} รายการ</div>
                {importResult.error > 0 && (
                  <div className="text-red-400 text-sm mb-3">ล้มเหลว {importResult.error} รายการ</div>
                )}
                <button onClick={() => router.push('/stock')}
                  className="w-full bg-blue-500 text-white font-bold py-3 rounded-2xl mt-4">
                  ดูคลังสินค้า →
                </button>
              </div>
            )}
          </>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <>
            <div className="bg-green-50 rounded-2xl p-4 shadow-sm mb-3">
              <h3 className="font-bold text-green-700 mb-2">📤 Export ข้อมูลทั้งหมดค่ะ</h3>
              <div className="text-xs text-green-600 space-y-1">
                <div>ไฟล์ Excel จะมี 3 sheet ค่ะ</div>
                <div className="bg-white rounded-lg p-2 text-gray-700 space-y-0.5 mt-1">
                  <div>📦 Sheet 1: <span className="font-bold">สินค้า</span> (ชื่อ, ราคา, stock, หมวดหมู่)</div>
                  <div>🛒 Sheet 2: <span className="font-bold">ประวัติการขาย</span> (วันที่, ลูกค้า, สินค้า, ยอด)</div>
                  <div>👤 Sheet 3: <span className="font-bold">ลูกค้า</span> (ชื่อ, เบอร์, โซน)</div>
                </div>
              </div>
            </div>

            <button onClick={handleExport} disabled={exporting}
              className="w-full bg-green-500 text-white font-bold py-4 rounded-2xl disabled:opacity-50 mb-3">
              {exporting ? '⏳ กำลัง export...' : '📥 ดาวน์โหลด Excel backup'}
            </button>

            <div className="bg-white rounded-2xl p-4 shadow-sm text-xs text-gray-500 space-y-1">
              <div>💡 แนะนำให้ backup ทุกอาทิตย์ค่ะ</div>
              <div>💾 ไฟล์จะถูกบันทึกในโฟลเดอร์ Downloads</div>
              <div>📅 ชื่อไฟล์จะมีวันที่ backup ด้วยค่ะ</div>
            </div>
          </>
        )}

      </div>
    </main>
  )
}