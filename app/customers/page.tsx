'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Zone = { id: string; name: string }
type Customer = {
  id: string
  name: string
  phone: string
  location_type: string
  address: string
  zone_id: string
  note: string
  zones: { name: string } | null
}

type CustomerStats = {
  total_orders: number
  total_amount: number
  unpaid_amount: number
}

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [search, setSearch] = useState('')
  const [selectedZone, setSelectedZone] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    phone: '',
    location_type: 'หอพัก',
    address: '',
    zone_id: '',
    note: '',
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [{ data: c }, { data: z }] = await Promise.all([
      supabase.from('customers').select('*, zones(name)').order('name'),
      supabase.from('zones').select('*').order('name'),
    ])
    setCustomers(c || [])
    setZones(z || [])
  }

  const filteredCustomers = customers.filter(c => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.address?.toLowerCase().includes(search.toLowerCase())
    const matchZone = !selectedZone || c.zone_id === selectedZone
    return matchSearch && matchZone
  })

  function openAdd() {
    setForm({ name: '', phone: '', location_type: 'หอพัก', address: '', zone_id: '', note: '' })
    setEditingCustomer(null)
    setShowAdd(true)
  }

  function openEdit(c: Customer) {
    setForm({
      name: c.name || '',
      phone: c.phone || '',
      location_type: c.location_type || 'หอพัก',
      address: c.address || '',
      zone_id: c.zone_id || '',
      note: c.note || '',
    })
    setEditingCustomer(c)
    setShowAdd(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        phone: form.phone || null,
        location_type: form.location_type,
        address: form.address || null,
        zone_id: form.zone_id || null,
        note: form.note || null,
      }
      if (editingCustomer) {
        await supabase.from('customers').update(data).eq('id', editingCustomer.id)
      } else {
        await supabase.from('customers').insert(data)
      }
      setShowAdd(false)
      fetchData()
    } catch (e) {
      alert('เกิดข้อผิดพลาดค่ะ')
    }
    setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ลบลูกค้า "${name}" ออกจากระบบ?`)) return
    await supabase.from('customers').delete().eq('id', id)
    fetchData()
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500">← กลับ</button>
            <h1 className="text-xl font-bold text-gray-800">👤 ลูกค้า</h1>
          </div>
          <button onClick={openAdd}
            className="bg-purple-500 text-white text-sm px-3 py-2 rounded-xl">
            + เพิ่มลูกค้า
          </button>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl p-3 shadow-sm mb-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-2 text-sm"
            placeholder="🔍 ค้นหาชื่อ / เบอร์ / สถานที่..." />
        </div>

        {/* Zone Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <button onClick={() => setSelectedZone('')}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
              !selectedZone ? 'bg-purple-500 text-white' : 'bg-white text-gray-600'
            }`}>
            ทุกโซน
          </button>
          {zones.map(z => (
            <button key={z.id} onClick={() => setSelectedZone(z.id)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
                selectedZone === z.id ? 'bg-purple-500 text-white' : 'bg-white text-gray-600'
              }`}>
              📍 {z.name}
            </button>
          ))}
        </div>

        {/* Customer Count */}
        <div className="text-xs text-gray-400 mb-2">
          พบลูกค้า {filteredCustomers.length} คน
        </div>

        {/* Customer List */}
        {filteredCustomers.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <div className="text-4xl mb-2">👤</div>
            <p>ยังไม่มีลูกค้าค่ะ</p>
          </div>
        ) : (
          <div className="space-y-2">            
        {filteredCustomers.map(c => (
            <div key={c.id}
            onClick={() => router.push(`/customers/${c.id}`)}
            className="w-full bg-white rounded-2xl p-4 shadow-sm text-left active:scale-95 transition-transform cursor-pointer">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800">{c.name}</div>
                    {c.phone && (
                      <div className="text-xs text-gray-400 mt-1">📞 {c.phone}</div>
                    )}
                    {c.address && (
                      <div className="text-xs text-gray-400 mt-1 line-clamp-1">
                        🏠 {c.location_type} {c.address}
                      </div>
                    )}
                    {c.zones && (
                      <span className="inline-block text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full mt-1">
                        📍 {c.zones.name}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(c) }}
                      className="text-blue-500 text-sm w-7 h-7 flex items-center justify-center">✏️</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name) }}
                      className="text-red-400 text-sm w-7 h-7 flex items-center justify-center">🗑️</button>
                  </div>
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
                <h3 className="font-bold text-lg">
                  {editingCustomer ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'}
                </h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 text-xl">✕</button>
              </div>

              <div className="space-y-3">
                {/* ชื่อ */}
                <div>
                  <label className="text-xs text-gray-500">ชื่อ *</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="ชื่อลูกค้า" />
                </div>

                {/* เบอร์ */}
                <div>
                  <label className="text-xs text-gray-500">เบอร์โทร</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    placeholder="08x-xxx-xxxx" />
                </div>

                {/* ประเภทสถานที่ + โซน */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">ประเภทสถานที่</label>
                    <select value={form.location_type}
                      onChange={e => setForm({...form, location_type: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                      <option>หอพัก</option>
                      <option>คอนโด</option>
                      <option>บ้าน</option>
                      <option>อพาร์ตเมนต์</option>
                      <option>ร้านค้า</option>
                      <option>อื่นๆ</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">โซน</label>
                    <select value={form.zone_id}
                      onChange={e => setForm({...form, zone_id: e.target.value})}
                      className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm">
                      <option value="">ไม่ระบุ</option>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* ที่อยู่ */}
                <div>
                  <label className="text-xs text-gray-500">ที่อยู่ / สถานที่ส่ง</label>
                  <textarea value={form.address}
                    onChange={e => setForm({...form, address: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    rows={2}
                    placeholder="ชื่อหอพัก / ห้อง / รายละเอียดที่อยู่" />
                </div>

                {/* หมายเหตุ */}
                <div>
                  <label className="text-xs text-gray-500">หมายเหตุ</label>
                  <textarea value={form.note}
                    onChange={e => setForm({...form, note: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl p-2 mt-1 text-sm"
                    rows={2}
                    placeholder="ข้อมูลเพิ่มเติม เช่น มีแมวกี่ตัว ชอบสินค้าอะไร" />
                </div>
              </div>

              <button onClick={handleSave} disabled={saving || !form.name.trim()}
                className="w-full bg-purple-500 text-white font-bold py-3 rounded-2xl mt-4 disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : editingCustomer ? '✅ บันทึกการแก้ไข' : '✅ เพิ่มลูกค้า'}
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}