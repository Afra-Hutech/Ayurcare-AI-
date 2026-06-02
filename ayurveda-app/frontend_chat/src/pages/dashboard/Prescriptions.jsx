import React, { useEffect, useState } from 'react'
import { Pill, Printer, Loader2, Calendar, Stethoscope, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { patientApi } from '../../services/api'
import { downloadPrescriptionPDF } from '../../utils/prescriptionPdf'

const Prescriptions = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await patientApi.listPrescriptions()
        setRows(res.data || [])
      } catch (err) {
        const status = err?.response?.status
        setError(
          status === 404
            ? 'Prescriptions API was not found. Restart the patient dev server so /api/patient routes reach port 5001.'
            : err?.response?.data?.message || 'Could not load prescriptions'
        )
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handlePrint = (row) => {
    downloadPrescriptionPDF({
      patientName: user.name,
      doctorName: row.doctorName,
      consultedAt: row.consultedAt || row.finalizedAt,
      notes: row.notes,
      medicines: row.medicines,
    })
  }

  return (
    <div className="h-full page-scroll">
      <div className="page-content max-w-[1100px] space-y-4">
        <header>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold uppercase text-[10px] tracking-widest">
            <Pill size={14} />
            <span>After consultation</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1">
            My Prescriptions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Prescriptions appear here after your doctor finalizes them at the end of a consultation.
          </p>
          <Link
            to="/ayurvedic-guide"
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            <ClipboardList size={14} />
            Open full care plan (diet, lifestyle, reminders)
          </Link>
        </header>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-emerald-600" size={28} />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
            <Pill className="mx-auto text-slate-300 mb-3" size={36} />
            <p className="font-semibold text-slate-800 dark:text-slate-100">No prescriptions yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Complete a consultation; your doctor&apos;s finalized prescription will show here.
            </p>
          </div>
        )}

        <div className="grid gap-3">
          {rows.map((row) => (
            <article
              key={row.prescriptionId}
              className="rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Stethoscope size={16} className="text-emerald-600" />
                    {row.doctorName}
                  </h2>
                  {row.specialty && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.specialty}</p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
                    <Calendar size={12} />
                    {row.finalizedAt
                      ? new Date(row.finalizedAt).toLocaleString()
                      : 'Date pending'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handlePrint(row)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#28328c] text-white px-4 py-2 text-xs font-bold hover:bg-[#1f2770] transition shrink-0"
                >
                  <Printer size={14} />
                  Download PDF
                </button>
              </div>

              {(row.dietPathya?.trim() || row.dietApathya?.trim() || row.lifestylePlan?.trim()) && (
                <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
                  {row.dietPathya?.trim() && <p><span className="font-bold text-emerald-700">Pathya:</span> {row.dietPathya.slice(0, 120)}{row.dietPathya.length > 120 ? '…' : ''}</p>}
                  {row.dietApathya?.trim() && <p><span className="font-bold text-rose-700">Apathya:</span> {row.dietApathya.slice(0, 120)}{row.dietApathya.length > 120 ? '…' : ''}</p>}
                  <Link to="/care-plan" className="font-bold text-indigo-600 hover:underline">Ayurvedic guide →</Link>
                </div>
              )}

              {row.notes?.trim() && (
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                  {row.notes}
                </p>
              )}

              {Array.isArray(row.medicines) && row.medicines.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  {row.medicines.map((med, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{med.name}</span>
                      {med.details && (
                        <span className="text-slate-600 dark:text-slate-400"> — {med.details}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Prescriptions
