'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import imageCompression from 'browser-image-compression'

// ─── Types ────────────────────────────────────────────────────────────────────
type CloudPocket = {
  id: string
  name: string
  emoji: string
  stream: 'capital' | 'profit'
  balance: number
  target: number | null
  color: string
  image_url: string | null
}

type DailyRecord = {
  id?: string
  record_date: string
  revenue: number
  capital_cost: number
  gross_profit: number
  net_profit: number
  capital_collected: boolean
  profit_collected: boolean
  capital_pocket_id: string | null
  profit_pocket_id: string | null
  capital_note: string
  profit_note: string
}

type StreamCard = {
  id: string
  stream: 'capital' | 'profit'
  label: string
  image_url: string | null
}

const POCKET_COLORS = [
  'from-teal-400 to-emerald-500',
  'from-blue-400 to-sky-500',
  'from-violet-400 to-purple-500',
  'from-rose-400 to-pink-500',
  'from-amber-400 to-orange-500',
  'from-indigo-400 to-blue-500',
  'from-green-400 to-teal-500',
  'from-fuchsia-400 to-pink-500',
]

const TAX_BRACKETS = [
  { min: 0, max: 150000, rate: 0 },
  { min: 150000, max: 300000, rate: 0.05 },
  { min: 300000, max: 500000, rate: 0.10 },
  { min: 500000, max: 750000, rate: 0.15 },
  { min: 750000, max: 1000000, rate: 0.20 },
  { min: 1000000, max: 2000000, rate: 0.25 },
  { min: 2000000, max: 5000000, rate: 0.30 },
  { min: 5000000, max: Infinity, rate: 0.35 },
]
function calcTax(net: number) {
  if (net <= 0) return 0
  let tax = 0
  for (const b of TAX_BRACKETS) {
    if (net <= b.min) break
    tax += (Math.min(net, b.max) - b.min) * b.rate
  }
  return Math.max(0, tax)
}

function emptyRecord(date: string): DailyRecord {
  return {
    record_date: date,
    revenue: 0, capital_cost: 0, gross_profit: 0, net_profit: 0,
    capital_collected: false, profit_collected: false,
    capital_pocket_id: null, profit_pocket_id: null,
    capital_note: '', profit_note: '',
  }
}

// ══════════════════════════════════════════════════════════════════════════════
export default function PersonalFinancePage() {
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]

  // stream card images (stored in supabase storage)
  const capitalImgRef = useRef<HTMLInputElement>(null)
  const profitImgRef = useRef<HTMLInputElement>(null)
  const pocketImgRef = useRef<HTMLInputElement>(null)
  const editPocketImgRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<'daily' | 'tax'>('daily')
  const [selectedDate, setSelectedDate] = useState(today)
  const [record, setRecord] = useState<DailyRecord>(emptyRecord(today))
  const [saving, setSaving] = useState(false)

  // Shop data (read only display)
  const [shopData, setShopData] = useState<{ revenue: number; capital_cost: number; gross_profit: number; net_profit: number; fee_self: number } | null>(null)

  // Selected stream (which amount card is tapped)
  const [activeStream, setActiveStream] = useState<'capital' | 'profit' | null>(null)
  const [capitalRemaining, setCapitalRemaining] = useState<number | null>(null)
  const [profitRemaining, setProfitRemaining] = useState<number | null>(null)

  // Stream cards (the cashbox-style card per stream)
  const [streamCards, setStreamCards] = useState<{ capital: StreamCard | null; profit: StreamCard | null }>({ capital: null, profit: null })
  const [uploadingStream, setUploadingStream] = useState(false)

  // Cloud Pockets
  const [pockets, setPockets] = useState<CloudPocket[]>([])
  const [showAddPocket, setShowAddPocket] = useState(false)
  const [editingPocket, setEditingPocket] = useState<CloudPocket | null>(null)
  const [pocketForm, setPocketForm] = useState({ name: '', emoji: '💰', stream: 'capital' as 'capital' | 'profit', target: '', color: POCKET_COLORS[0], image_url: null as string | null })
  const [savingPocket, setSavingPocket] = useState(false)
  const [uploadingPocketImg, setUploadingPocketImg] = useState(false)

  // Transfer popup
  const [transferPocket, setTransferPocket] = useState<CloudPocket | null>(null)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferNote, setTransferNote] = useState('')
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  // Transfer popup
  

  // Tax
  const currentYear = new Date().getFullYear() + 543
  const [taxYear, setTaxYear] = useState(currentYear)
  const [taxDeductions, setTaxDeductions] = useState<any[]>([])
  const [yearlyIncome, setYearlyIncome] = useState({ type8: 0, type2: 60000 })
  const [showAddDeduction, setShowAddDeduction] = useState(false)
  const [newDeduction, setNewDeduction] = useState({ type: 'other', label: '', amount: 0 })

  // ─── Fetch ─────────────────────────────────────────────────────────────────
  const fetchPockets = useCallback(async () => {
    const { data } = await supabase.from('cloud_pockets').select('*').order('created_at')
    setPockets((data || []) as CloudPocket[])
  }, [])

  const fetchRecord = useCallback(async (date: string) => {
    const { data } = await supabase.from('personal_finance_records').select('*').eq('record_date', date).maybeSingle()
    setRecord(data ? { ...emptyRecord(date), ...data } : emptyRecord(date))
  }, [])

  const fetchShopData = useCallback(async (date: string) => {
    const [{ data: orders }, { data: expenses }, { data: receipts }] = await Promise.all([
      supabase.from('orders').select('total, order_items(quantity, products(avg_cost))')
        .gte('order_date', date + 'T00:00:00+07:00').lte('order_date', date + 'T23:59:59+07:00')
        .eq('payment_status', 'paid').neq('status', 'cancelled'),
      supabase.from('expenses').select('amount, stream').eq('date', date),
      supabase.from('stock_receipts').select('service_fee_actual, fee_payer').eq('order_date', date),
    ])
    const revenue = (orders || []).reduce((s: number, o: any) => s + o.total, 0)
    const capital_cost = (orders || []).reduce((s: number, o: any) =>
      s + o.order_items.reduce((ss: number, i: any) => ss + ((i.products?.avg_cost || 0) * i.quantity), 0), 0)
    const gross_profit = revenue - capital_cost
    const profit_exp = (expenses || []).filter((e: any) => e.stream === 'profit').reduce((s: number, e: any) => s + e.amount, 0)
    const net_profit = gross_profit - profit_exp
    const fee_self = (receipts || []).filter((r: any) => r.fee_payer !== 'white').reduce((s: number, r: any) => s + (r.service_fee_actual || 0), 0)
    const capAmt = capital_cost + fee_self
    const profAmt = net_profit
    setShopData({ revenue, capital_cost, gross_profit, net_profit, fee_self })
    // initialize remaining only if not already set (don't override after transfers)
    setCapitalRemaining(prev => prev === null ? capAmt : prev)
    setProfitRemaining(prev => prev === null ? profAmt : prev)
  }, [])

  const fetchStreamCards = useCallback(async () => {
    // load stream card images from storage
    const tryImg = async (path: string) => {
      try {
        const { data } = supabase.storage.from('products').getPublicUrl(path)
        const res = await fetch(data.publicUrl, { method: 'HEAD' })
        return res.ok ? data.publicUrl + '?t=' + Date.now() : null
      } catch { return null }
    }
    const [capitalImg, profitImg] = await Promise.all([
      tryImg('stream-cards/capital.jpg'),
      tryImg('stream-cards/profit.jpg'),
    ])
    setStreamCards({
      capital: { id: 'capital', stream: 'capital', label: 'สายทุน', image_url: capitalImg },
      profit: { id: 'profit', stream: 'profit', label: 'สายกำไร', image_url: profitImg },
    })
  }, [])

  const fetchTaxData = useCallback(async (year: number) => {
    const { data } = await supabase.from('tax_deductions').select('*').eq('year', year).order('type')
    setTaxDeductions(data || [])
    const ceYear = year - 543
    const { data: orders } = await supabase.from('orders').select('total')
      .gte('order_date', `${ceYear}-01-01T00:00:00+07:00`)
      .lte('order_date', `${ceYear}-12-31T23:59:59+07:00`)
      .eq('payment_status', 'paid').neq('status', 'cancelled')
    setYearlyIncome(prev => ({ ...prev, type8: (orders || []).reduce((s: number, o: any) => s + o.total, 0) }))
  }, [])

  useEffect(() => {
    fetchRecord(selectedDate)
    fetchShopData(selectedDate)
    // reset remaining when date changes
    setCapitalRemaining(null)
    setProfitRemaining(null)
  }, [selectedDate])
  useEffect(() => { fetchPockets(); fetchStreamCards() }, [])
  useEffect(() => { fetchTaxData(taxYear) }, [taxYear])

  // active amount based on stream selected (reduced after transfers)
  const rawCapitalAmount = shopData ? shopData.capital_cost + shopData.fee_self : 0
  const rawProfitAmount = shopData ? shopData.net_profit : 0
  const activeAmount = activeStream === 'capital'
    ? (capitalRemaining !== null ? capitalRemaining : rawCapitalAmount)
    : activeStream === 'profit'
    ? (profitRemaining !== null ? profitRemaining : rawProfitAmount)
    : null

  // ─── Upload stream card image ───────────────────────────────────────────────
  async function handleStreamImgUpload(e: React.ChangeEvent<HTMLInputElement>, stream: 'capital' | 'profit') {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingStream(true)
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.3, maxWidthOrHeight: 400, useWebWorker: true })
      await supabase.storage.from('products').upload(`stream-cards/${stream}.jpg`, compressed, { upsert: true, contentType: 'image/jpeg' })
      await fetchStreamCards()
    } catch {}
    setUploadingStream(false)
  }

  // ─── Upload pocket image ────────────────────────────────────────────────────
  async function handlePocketImgUpload(e: React.ChangeEvent<HTMLInputElement>, isEdit = false) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPocketImg(true)
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.3, maxWidthOrHeight: 400, useWebWorker: true })
      const filename = `pockets/pocket-${Date.now()}.jpg`
      await supabase.storage.from('products').upload(filename, compressed, { upsert: true, contentType: 'image/jpeg' })
      const { data } = supabase.storage.from('products').getPublicUrl(filename)
      const url = data.publicUrl + '?t=' + Date.now()
      if (isEdit) setEditingPocket(p => p ? { ...p, image_url: url } : null)
      else setPocketForm(p => ({ ...p, image_url: url }))
    } catch {}
    setUploadingPocketImg(false)
  }

  // ─── Save record ────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    const payload = { ...record, updated_at: new Date().toISOString() }
    if (record.id) {
      await supabase.from('personal_finance_records').update(payload).eq('id', record.id)
    } else {
      const { data } = await supabase.from('personal_finance_records').insert(payload).select().single()
      if (data) setRecord(data)
    }
    setSaving(false)
    showToast('บันทึกแล้วค่ะ ✅')
  }

  // ─── Save pocket ────────────────────────────────────────────────────────────
  async function handleSavePocket() {
    setSavingPocket(true)
    if (editingPocket) {
      await supabase.from('cloud_pockets').update({
        name: editingPocket.name, emoji: editingPocket.emoji,
        color: editingPocket.color, target: editingPocket.target, image_url: editingPocket.image_url,
      }).eq('id', editingPocket.id)
      setEditingPocket(null)
    } else {
      await supabase.from('cloud_pockets').insert({
        name: pocketForm.name, emoji: pocketForm.emoji, stream: pocketForm.stream,
        balance: 0, target: pocketForm.target ? Number(pocketForm.target) : null,
        color: pocketForm.color, image_url: pocketForm.image_url,
      })
      setPocketForm({ name: '', emoji: '💰', stream: 'capital', target: '', color: POCKET_COLORS[0], image_url: null })
      setShowAddPocket(false)
    }
    fetchPockets()
    setSavingPocket(false)
  }

  async function handleDeletePocket(id: string) {
    if (!confirm('ลบกระเป๋านี้?')) return
    await supabase.from('cloud_pockets').delete().eq('id', id)
    fetchPockets()
  }


  // ─── Transfer money into pocket ──────────────────────────────────────────────
  async function handleTransfer() {
    if (!transferPocket || !transferAmount || Number(transferAmount) <= 0) return
    setSavingTransfer(true)
    const amt = Number(transferAmount)
    const newBalance = transferPocket.balance + amt
    await supabase.from('cloud_pockets').update({ balance: newBalance }).eq('id', transferPocket.id)
    // update pocket balance locally
    setPockets(prev => prev.map(p => p.id === transferPocket.id ? { ...p, balance: newBalance } : p))
    // reduce remaining amount in cashbox block
    if (transferPocket.stream === 'capital') {
      setCapitalRemaining(prev => (prev ?? 0) - amt)
    } else {
      setProfitRemaining(prev => (prev ?? 0) - amt)
    }
    setTransferPocket(null)
    setTransferAmount('')
    setTransferNote('')
    setSavingTransfer(false)
    showToast(`โอน ${amt.toLocaleString()}฿ เข้า "${transferPocket.name}" แล้วค่ะ ✅`)
  }

  // Tax
  const totalSSO = taxDeductions.filter(d => d.type === 'sso').reduce((s, d) => s + d.amount, 0)
  const totalOtherDed = taxDeductions.filter(d => d.type !== 'sso').reduce((s, d) => s + d.amount, 0)
  const type8Net = yearlyIncome.type8 * 0.4
  const type2Net = yearlyIncome.type2 - Math.min(yearlyIncome.type2 * 0.5, 100000)
  const combinedIncome = type8Net + type2Net
  const totalDed = 60000 + totalSSO + totalOtherDed
  const taxableIncome = Math.max(0, combinedIncome - totalDed)
  const halfTaxable = Math.max(0, (yearlyIncome.type8 / 2 * 0.4) + (yearlyIncome.type2 / 2 - Math.min(yearlyIncome.type2 / 2 * 0.5, 50000)) - 30000 - totalSSO / 2)
  const tax94 = calcTax(halfTaxable) * 2
  const tax90Full = calcTax(taxableIncome)
  const tax90Due = Math.max(0, tax90Full - tax94)
  const now2 = new Date()
  const isNear94 = now2.getMonth() >= 6 && now2.getMonth() <= 8
  const isNear90 = now2.getMonth() <= 2

  const streamPockets = pockets.filter(p => p.stream === activeStream)

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <main className="min-h-screen bg-[#fff5f3]">
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[99] px-5 py-3 rounded-2xl shadow-lg text-white text-sm font-bold flex items-center gap-2 transition-all animate-bounce-once ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <span>{toast.type === 'success' ? '✅' : '❌'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* hidden file inputs */}
      <input ref={capitalImgRef} type="file" accept="image/*" className="hidden" onChange={e => handleStreamImgUpload(e, 'capital')} />
      <input ref={profitImgRef} type="file" accept="image/*" className="hidden" onChange={e => handleStreamImgUpload(e, 'profit')} />
      <input ref={pocketImgRef} type="file" accept="image/*" className="hidden" onChange={e => handlePocketImgUpload(e, false)} />
      <input ref={editPocketImgRef} type="file" accept="image/*" className="hidden" onChange={e => handlePocketImgUpload(e, true)} />

      {/* HEADER */}
      <div className="sticky top-0 z-20 bg-[#fff5f3]/95 backdrop-blur-sm px-4 pt-10 pb-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')}
            className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-sm text-gray-500 active:scale-95 transition-transform">←</button>
          <h1 className="text-lg font-bold text-gray-800">📓 บันทึกการเงินส่วนตัว</h1>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[{ key: 'daily', label: '📅 บันทึกรายวัน' }, { key: 'tax', label: '🧾 ภาษี 90/94' }].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              className={`py-2.5 rounded-2xl text-xs font-bold transition-all ${activeTab === t.key ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-sm' : 'bg-white text-gray-400 shadow-sm'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-10 pt-2 space-y-3">
        {activeTab === 'daily' && (
          <>
            {/* เลือกวันที่ */}
            <div className="bg-white rounded-2xl p-3 shadow-sm">
              <label className="text-xs text-gray-400">เลือกวันที่</label>
              <div className="flex gap-2 mt-1">
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none" />
                <button onClick={() => setSelectedDate(today)}
                  className="bg-gradient-to-r from-orange-400 to-rose-400 text-white text-xs px-4 rounded-xl font-semibold">วันนี้</button>
              </div>
            </div>

            {/* ── ข้อมูลจากร้าน (แสดงอย่างเดียว) ── */}
            {shopData && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 font-medium mb-3">🏪 ข้อมูลจากร้านวันนี้</p>
                <div className="grid grid-cols-2 gap-y-3">
                  {[
                    { label: 'รายรับ', val: shopData.revenue, color: 'text-green-600' },
                    { label: 'กำไรขั้นต้น', val: shopData.gross_profit, color: 'text-blue-500' },
                    { label: 'ต้นทุน+ค่ากด', val: shopData.capital_cost + shopData.fee_self, color: 'text-red-400', tappable: 'capital' },
                    { label: 'กำไรสุทธิ', val: shopData.net_profit, color: 'text-green-700', tappable: 'profit' },
                  ].map(f => (
                    <button key={f.label}
                      onClick={() => f.tappable && setActiveStream(prev => prev === f.tappable ? null : f.tappable as any)}
                      className={`text-left px-3 py-2.5 rounded-xl transition-all ${
                        f.tappable
                          ? activeStream === f.tappable
                            ? 'bg-amber-100 ring-2 ring-amber-400'
                            : 'bg-gray-50 active:scale-95'
                          : 'bg-gray-50 cursor-default'
                      }`}>
                      <p className="text-xs text-gray-400">{f.label}{f.tappable ? ' 👆' : ''}</p>
                      <p className={`font-bold text-base mt-0.5 ${f.color}`}>
                        {f.val.toLocaleString(undefined, { maximumFractionDigits: 0 })}฿
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Stream Card (Cashbox style) ── */}
            {activeStream && (
              <div className="space-y-3">
                {/* Card แสดงสาย + ยอด */}
                {(() => {
                  const card = streamCards[activeStream]
                  const isCapital = activeStream === 'capital'
                  const amount = isCapital
                    ? (capitalRemaining !== null ? capitalRemaining : (shopData ? shopData.capital_cost + shopData.fee_self : 0))
                    : (profitRemaining !== null ? profitRemaining : (shopData ? shopData.net_profit : 0))
                  return (
                    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                      <div className="flex items-center gap-4 p-4">
                        {/* รูป */}
                        <div className="relative flex-shrink-0">
                          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100">
                            {card?.image_url ? (
                              <img src={card.image_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center text-2xl ${isCapital ? 'bg-blue-100' : 'bg-green-100'}`}>
                                {isCapital ? '🏦' : '💰'}
                              </div>
                            )}
                          </div>
                          {/* ปุ่มเปลี่ยนรูป */}
                          <button
                            onClick={() => isCapital ? capitalImgRef.current?.click() : profitImgRef.current?.click()}
                            className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center text-[8px] text-white shadow active:scale-95">
                            📷
                          </button>
                        </div>

                        {/* ชื่อ + ยอด */}
                        <div className="flex-1">
                          <p className="text-xs text-gray-400 font-medium">
                            {isCapital ? 'สายทุน' : 'สายกำไร'}
                          </p>
                          <p className={`text-2xl font-bold mt-0.5 ${isCapital ? 'text-blue-600' : 'text-green-600'}`}>
                            ฿ {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>

                        {/* ปุ่มเปลี่ยนชื่อ/สาย */}
                        <div className="text-right">
                          <p className={`text-xs font-bold px-2 py-1 rounded-full ${isCapital ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                            {isCapital ? '🏦 ทุน' : '💰 กำไร'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* ── Cloud Pockets ── */}
                <div>
                  <div className="flex justify-between items-center mb-2 px-1">
                    <p className="text-xs font-bold text-gray-600">
                      Cloud Pocket {activeStream === 'capital' ? 'สายทุน 🏦' : 'สายกำไร 💰'}
                    </p>
                    <button onClick={() => { setPocketForm(p => ({ ...p, stream: activeStream! })); setShowAddPocket(true) }}
                      className="text-xs bg-amber-400 text-white px-3 py-1.5 rounded-xl font-bold active:scale-95">
                      + เพิ่ม
                    </button>
                  </div>

                  {streamPockets.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                      <p className="text-3xl mb-2">💼</p>
                      <p className="text-sm text-gray-400 mb-3">ยังไม่มี Cloud Pocket</p>
                      <button onClick={() => { setPocketForm(p => ({ ...p, stream: activeStream! })); setShowAddPocket(true) }}
                        className="text-xs text-amber-500 font-bold bg-amber-50 px-4 py-2 rounded-xl">
                        + เพิ่มกระเป๋าแรก
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {streamPockets.map(p => (
                        <div key={p.id}
                          onClick={() => {
                            setTransferPocket(p)
                            setTransferAmount('')
                            setTransferNote('')
                          }}
                          className={`relative rounded-2xl overflow-hidden shadow-sm cursor-pointer transition-all active:scale-95 ${
                            (activeStream === 'capital' ? record.capital_pocket_id : record.profit_pocket_id) === p.id
                              ? 'ring-2 ring-offset-1 ring-amber-400'
                              : ''
                          }`}>
                          {/* Background */}
                          {p.image_url ? (
                            <div className="h-36">
                              <img src={p.image_url} className="w-full h-full object-cover" alt={p.name} />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                            </div>
                          ) : (
                            <div className={`h-36 bg-gradient-to-br ${p.color}`}>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-5xl opacity-40">{p.emoji}</span>
                              </div>
                            </div>
                          )}

                          {/* Overlay content */}
                          <div className="absolute inset-0 flex flex-col justify-between p-3">
                            <div className="flex justify-between items-start">
                              {(activeStream === 'capital' ? record.capital_pocket_id : record.profit_pocket_id) === p.id && (
                                <span className="bg-white/90 text-amber-600 text-[9px] font-bold px-2 py-0.5 rounded-full">✓ เลือก</span>
                              )}
                              <div className="ml-auto flex gap-1">
                                <button onClick={e => { e.stopPropagation(); setEditingPocket(p) }}
                                  className="w-6 h-6 bg-white/80 rounded-full flex items-center justify-center text-[10px]">✏️</button>
                                <button onClick={e => { e.stopPropagation(); handleDeletePocket(p.id) }}
                                  className="w-6 h-6 bg-white/80 rounded-full flex items-center justify-center text-[10px]">🗑️</button>
                              </div>
                            </div>
                            <div>
                              <p className="text-white font-bold text-sm drop-shadow">{p.name}</p>
                              <p className="text-white/90 font-bold text-base drop-shadow">฿{p.balance.toLocaleString()}</p>
                              {p.target && (
                                <>
                                  <div className="h-1 bg-white/30 rounded-full mt-1.5 overflow-hidden">
                                    <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, (p.balance / p.target) * 100)}%` }} />
                                  </div>
                                  <p className="text-white/60 text-[9px] mt-0.5">เป้า ฿{p.target.toLocaleString()}</p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Note */}
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-bold text-gray-500 mb-2">📝 หมายเหตุ</p>
                  <input
                    value={activeStream === 'capital' ? record.capital_note : record.profit_note}
                    onChange={e => setRecord(prev => ({ ...prev, [activeStream === 'capital' ? 'capital_note' : 'profit_note']: e.target.value }))}
                    className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm outline-none"
                    placeholder={activeStream === 'capital' ? 'เช่น โอนเข้ากสิกรแล้ว' : 'เช่น เก็บออมไว้ซื้อของ'}
                  />
                </div>
              </div>
            )}

            {/* ✓ เก็บเงินแล้ว */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'capital_collected', label: 'เก็บเงินทุนแล้ว', color: 'bg-blue-500', border: 'border-blue-100' },
                { key: 'profit_collected', label: 'เก็บเงินกำไรแล้ว', color: 'bg-green-500', border: 'border-green-100' },
              ].map(b => (
                <button key={b.key}
                  onClick={() => setRecord(prev => ({ ...prev, [b.key]: !(prev as any)[b.key] }))}
                  className={`py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-95 ${
                    (record as any)[b.key] ? `${b.color} text-white shadow-sm` : `bg-white text-gray-300 border-2 border-dashed ${b.border}`
                  }`}>
                  {(record as any)[b.key] ? `✅ ${b.label}` : `⬜ ${b.label}`}
                </button>
              ))}
            </div>

            {/* บันทึก */}
            <button onClick={handleSave} disabled={saving}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-4 rounded-2xl disabled:opacity-50 active:scale-95 transition-transform shadow-sm">
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกข้อมูลวันนี้'}
            </button>
          </>
        )}

        {/* ══ TAB: ภาษี ══ */}
        {activeTab === 'tax' && (
          <>
            <div className="bg-white rounded-2xl p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <button onClick={() => setTaxYear(y => y - 1)} className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-xl text-gray-500">‹</button>
                <p className="font-bold text-gray-800">ปีภาษี พ.ศ. {taxYear}</p>
                <button onClick={() => setTaxYear(y => y + 1)} className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-xl text-gray-500">›</button>
              </div>
            </div>

            {(isNear94 || isNear90) && (
              <div className={`border rounded-2xl p-3 flex items-center gap-3 ${isNear94 ? 'bg-orange-100 border-orange-200' : 'bg-red-100 border-red-200'}`}>
                <span className="text-2xl">⏰</span>
                <div>
                  <p className={`font-bold text-sm ${isNear94 ? 'text-orange-700' : 'text-red-700'}`}>ใกล้วันยื่น {isNear94 ? 'ภงด 94!' : 'ภงด 90!'}</p>
                  <p className={`text-xs ${isNear94 ? 'text-orange-600' : 'text-red-600'}`}>{isNear94 ? 'ยื่นภายในกันยายน (ม.ค.–มิ.ย.)' : 'ยื่นภายในมีนาคม (ทั้งปี)'}</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-500 mb-3">📊 รายได้ประจำปี</p>
              {[
                { key: 'type8', label: 'ประเภท 8 — ขายของ', sub: 'หักค่าใช้จ่าย 60%', net: type8Net },
                { key: 'type2', label: 'ประเภท 2 — ค่าจ้าง', sub: 'หักค่าใช้จ่าย 50% (ไม่เกิน 1 แสน)', net: type2Net },
              ].map(f => (
                <div key={f.key} className="bg-gray-50 rounded-xl p-3 mb-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-medium text-gray-600">{f.label}</p>
                      <p className="text-[10px] text-gray-400">{f.sub}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <input type="number" value={(yearlyIncome as any)[f.key] || ''}
                        onChange={e => setYearlyIncome(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
                        className="w-24 text-right bg-white rounded-lg px-2 py-1.5 text-sm font-bold text-green-600 outline-none shadow-sm" />
                      <span className="text-xs text-gray-400">฿</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-blue-500 mt-1.5">คงเหลือ: {f.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}฿</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-bold text-gray-500">🎟️ ค่าลดหย่อน</p>
                <button onClick={() => setShowAddDeduction(true)} className="text-xs bg-amber-400 text-white px-3 py-1.5 rounded-xl font-bold">+ เพิ่ม</button>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
                <span className="text-gray-600">ลดหย่อนส่วนตัว</span><span className="font-bold">60,000฿</span>
              </div>
              {totalSSO > 0 && (
                <div className="flex justify-between py-2 border-b border-gray-100 text-sm">
                  <span className="text-gray-600">ประกันสังคม (SSO)</span>
                  <span className="font-bold text-blue-600">{totalSSO.toLocaleString()}฿</span>
                </div>
              )}
              {taxDeductions.filter(d => d.type !== 'sso').map(d => (
                <div key={d.id} className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-600">{d.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{d.amount.toLocaleString()}฿</span>
                    <button onClick={async () => { await supabase.from('tax_deductions').delete().eq('id', d.id); fetchTaxData(taxYear) }} className="text-red-300 text-xs">🗑️</button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 mt-1 font-bold text-sm">
                <span className="text-gray-700">รวมค่าลดหย่อน</span>
                <span className="text-amber-500">{totalDed.toLocaleString()}฿</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 shadow-sm border border-amber-100">
              <p className="text-xs font-bold text-amber-700 mb-3">🧮 สรุปภาษีที่ต้องจ่าย (ประมาณการ)</p>
              <div className="space-y-2">
                <div className="bg-white rounded-xl p-3 flex justify-between text-sm">
                  <span className="text-gray-500">เงินได้สุทธิ</span>
                  <span className={`font-bold ${taxableIncome > 0 ? 'text-orange-600' : 'text-green-600'}`}>{taxableIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}฿</span>
                </div>
                <div className={`rounded-xl p-3 ${isNear94 ? 'bg-orange-100' : 'bg-white'}`}>
                  <div className="flex justify-between">
                    <div><p className="font-bold text-orange-600 text-sm">ภงด 94</p><p className="text-[10px] text-gray-400">ยื่นภายในกันยายน</p></div>
                    <p className="font-bold text-orange-600 text-lg">{tax94.toLocaleString(undefined, { maximumFractionDigits: 0 })}฿</p>
                  </div>
                </div>
                <div className={`rounded-xl p-3 ${isNear90 ? 'bg-red-100' : 'bg-white'}`}>
                  <div className="flex justify-between mb-2">
                    <div><p className="font-bold text-red-600 text-sm">ภงด 90</p><p className="text-[10px] text-gray-400">ยื่นภายในมีนาคมปีหน้า</p></div>
                    <p className="font-bold text-red-600 text-lg">{tax90Full.toLocaleString(undefined, { maximumFractionDigits: 0 })}฿</p>
                  </div>
                  <div className="flex justify-between text-xs border-t border-gray-100 pt-2">
                    <span className="text-gray-400">หัก ภงด 94</span><span className="text-green-600">-{tax94.toLocaleString(undefined, { maximumFractionDigits: 0 })}฿</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold mt-1">
                    <span>ต้องจ่ายเพิ่ม</span>
                    <span className={tax90Due > 0 ? 'text-red-500' : 'text-green-500'}>{tax90Due > 0 ? `${tax90Due.toLocaleString(undefined, { maximumFractionDigits: 0 })}฿` : 'ไม่ต้องจ่ายเพิ่ม'}</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-3 text-center">* ประมาณการเบื้องต้น ควรปรึกษานักบัญชีก่อนยื่นจริงค่ะ</p>
            </div>
          </>
        )}
      </div>

      {/* ══ Modal: เพิ่ม Cloud Pocket ══ */}
      {showAddPocket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">+ Cloud Pocket ใหม่</h3>
              <button onClick={() => setShowAddPocket(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            {/* รูป */}
            <div className="flex justify-center mb-4">
              <button onClick={() => pocketImgRef.current?.click()}
                className="w-24 h-24 rounded-2xl overflow-hidden shadow-sm relative active:scale-95">
                {pocketForm.image_url
                  ? <img src={pocketForm.image_url} className="w-full h-full object-cover" alt="" />
                  : <div className={`w-full h-full bg-gradient-to-br ${pocketForm.color} flex items-center justify-center text-4xl`}>{pocketForm.emoji}</div>
                }
                <div className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[9px] text-center py-1">{uploadingPocketImg ? '...' : '📷 ใส่รูป'}</div>
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(['capital', 'profit'] as const).map(s => (
                  <button key={s} onClick={() => setPocketForm(p => ({ ...p, stream: s }))}
                    className={`py-3 rounded-2xl text-sm font-bold ${pocketForm.stream === s ? (s === 'capital' ? 'bg-blue-500 text-white' : 'bg-green-500 text-white') : 'bg-white text-gray-400 shadow-sm'}`}>
                    {s === 'capital' ? '🏦 สายทุน' : '💰 สายกำไร'}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs text-gray-500">ชื่อกระเป๋า *</label>
                <input value={pocketForm.name} onChange={e => setPocketForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="เช่น ปิดหนี้, เก็บออม" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Emoji (ถ้าไม่มีรูป)</label>
                <input value={pocketForm.emoji} onChange={e => setPocketForm(p => ({ ...p, emoji: e.target.value }))}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="💰" />
              </div>
              <div>
                <label className="text-xs text-gray-500">เป้าหมาย (ถ้ามี)</label>
                <input type="number" value={pocketForm.target} onChange={e => setPocketForm(p => ({ ...p, target: e.target.value }))}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500">สีการ์ด</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {POCKET_COLORS.map(c => (
                    <button key={c} onClick={() => setPocketForm(p => ({ ...p, color: c }))}
                      className={`w-8 h-8 rounded-xl bg-gradient-to-br ${c} ${pocketForm.color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''}`} />
                  ))}
                </div>
              </div>
            </div>
            <button onClick={handleSavePocket} disabled={savingPocket || !pocketForm.name}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95">
              {savingPocket ? 'กำลังบันทึก...' : '✅ เพิ่มกระเป๋า'}
            </button>
          </div>
        </div>
      )}

      {/* ══ Modal: แก้ไข Pocket ══ */}
      {editingPocket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">✏️ แก้ไขกระเป๋า</h3>
              <button onClick={() => setEditingPocket(null)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="flex justify-center mb-4">
              <button onClick={() => editPocketImgRef.current?.click()}
                className="w-24 h-24 rounded-2xl overflow-hidden shadow-sm relative active:scale-95">
                {editingPocket.image_url
                  ? <img src={editingPocket.image_url} className="w-full h-full object-cover" alt="" />
                  : <div className={`w-full h-full bg-gradient-to-br ${editingPocket.color} flex items-center justify-center text-4xl`}>{editingPocket.emoji}</div>
                }
                <div className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-[9px] text-center py-1">{uploadingPocketImg ? '...' : '📷 เปลี่ยนรูป'}</div>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">ชื่อกระเป๋า</label>
                <input value={editingPocket.name} onChange={e => setEditingPocket(p => p ? { ...p, name: e.target.value } : null)}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Emoji</label>
                <input value={editingPocket.emoji} onChange={e => setEditingPocket(p => p ? { ...p, emoji: e.target.value } : null)}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">เป้าหมาย</label>
                <input type="number" value={editingPocket.target || ''} onChange={e => setEditingPocket(p => p ? { ...p, target: Number(e.target.value) || null } : null)}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500">สีการ์ด</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {POCKET_COLORS.map(c => (
                    <button key={c} onClick={() => setEditingPocket(p => p ? { ...p, color: c } : null)}
                      className={`w-8 h-8 rounded-xl bg-gradient-to-br ${c} ${editingPocket.color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''}`} />
                  ))}
                </div>
              </div>
            </div>
            <button onClick={handleSavePocket} disabled={savingPocket}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95">
              {savingPocket ? 'กำลังบันทึก...' : '✅ บันทึกการแก้ไข'}
            </button>
          </div>
        </div>
      )}

      {/* ══ Modal: ค่าลดหย่อน ══ */}
      {showAddDeduction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">เพิ่มค่าลดหย่อน</h3>
              <button onClick={() => setShowAddDeduction(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">ประเภท</label>
                <select value={newDeduction.type} onChange={e => setNewDeduction(p => ({ ...p, type: e.target.value }))}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm">
                  <option value="life_insurance">ประกันชีวิต</option>
                  <option value="health_insurance">ประกันสุขภาพ</option>
                  <option value="rmf">RMF/LTF/Thai ESG</option>
                  <option value="home_loan">ดอกเบี้ยบ้าน</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">ชื่อรายการ *</label>
                <input value={newDeduction.label} onChange={e => setNewDeduction(p => ({ ...p, label: e.target.value }))}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="เช่น ประกันชีวิต AIA" />
              </div>
              <div>
                <label className="text-xs text-gray-500">จำนวนเงิน (฿) *</label>
                <input type="number" value={newDeduction.amount || ''} onChange={e => setNewDeduction(p => ({ ...p, amount: Number(e.target.value) }))}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm" placeholder="0" />
              </div>
            </div>
            <button onClick={async () => {
              if (!newDeduction.label || !newDeduction.amount) return
              await supabase.from('tax_deductions').insert({ year: taxYear, ...newDeduction })
              setNewDeduction({ type: 'other', label: '', amount: 0 })
              setShowAddDeduction(false)
              fetchTaxData(taxYear)
            }} disabled={!newDeduction.label || !newDeduction.amount}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95">
              ✅ เพิ่มค่าลดหย่อน
            </button>
          </div>
        </div>
      )}

      {/* ══ Modal: โอนเงินเข้า Pocket ══ */}
      {transferPocket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-[#fff5f3] w-full rounded-t-3xl p-4">
            <div className="flex justify-center pt-1 pb-3"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>

            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-gray-800">💸 โอนเงินเข้ากระเป๋า</h3>
              <button onClick={() => setTransferPocket(null)} className="text-gray-400 text-xl">✕</button>
            </div>

            {/* Pocket preview */}
            <div className="flex items-center gap-3 bg-white rounded-2xl p-3 mb-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                {transferPocket.image_url
                  ? <img src={transferPocket.image_url} className="w-full h-full object-cover" alt="" />
                  : <div className={`w-full h-full bg-gradient-to-br ${transferPocket.color} flex items-center justify-center text-2xl`}>{transferPocket.emoji}</div>
                }
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-800 text-sm">{transferPocket.name}</p>
                <p className="text-xs text-gray-400">ยอดปัจจุบัน: <span className="font-bold text-green-600">฿{transferPocket.balance.toLocaleString()}</span></p>
              </div>
              <div className="text-right">
                {transferAmount && Number(transferAmount) > 0 && (
                  <p className="text-xs text-gray-400">หลังโอน</p>
                )}
                {transferAmount && Number(transferAmount) > 0 && (
                  <p className="text-sm font-bold text-amber-500">
                    ฿{(transferPocket.balance + Number(transferAmount)).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">ยอดเงินที่จะโอนเข้า (฿) *</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">฿</span>
                  <input
                    type="number"
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value)}
                    className="w-full bg-white rounded-xl pl-8 pr-3 py-3 text-lg font-bold outline-none shadow-sm text-gray-800"
                    placeholder="0"
                    autoFocus
                  />
                </div>
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2 flex-wrap">
                {[100, 200, 500, 1000].map(amt => (
                  <button key={amt} onClick={() => setTransferAmount(String(amt))}
                    className="text-xs bg-white px-3 py-1.5 rounded-xl font-bold text-gray-500 shadow-sm active:scale-95">
                    +{amt.toLocaleString()}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-gray-500">หมายเหตุ</label>
                <input
                  value={transferNote}
                  onChange={e => setTransferNote(e.target.value)}
                  className="w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none mt-1 shadow-sm"
                  placeholder="เช่น โอนจากกำไรวันนี้"
                />
              </div>
            </div>

            <button
              onClick={handleTransfer}
              disabled={savingTransfer || !transferAmount || Number(transferAmount) <= 0}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-3.5 rounded-2xl mt-4 disabled:opacity-50 active:scale-95 transition-transform">
              {savingTransfer ? 'กำลังโอน...' : `✅ โอน ฿${Number(transferAmount || 0).toLocaleString()} เข้า ${transferPocket.name}`}
            </button>
          </div>
        </div>
      )}

    </main>
  )
}