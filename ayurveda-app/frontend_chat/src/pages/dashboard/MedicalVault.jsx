import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, File, Trash2, Download, Eye, Filter, Plus, Folder, CheckCircle2 } from 'lucide-react'
import { patientApi } from '../../services/api'

const ACCEPTED_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp)$/i

function isAllowedFile(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (type.includes('pdf') || type.startsWith('image/')) return true
  return ACCEPTED_EXT.test(file.name || '')
}

const MedicalVault = () => {
  const location = useLocation()
  const fileInputRef = useRef(null)
  const [records, setRecords] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [uploadCategory, setUploadCategory] = useState('Other')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await patientApi.getRecords()
      setRecords(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      const status = err.response?.status
      const msg = err.response?.data?.message || err.message
      const offline = err.code === 'ERR_NETWORK' || String(err.message || '').includes('Network')
      setError(
        offline
          ? 'Cannot reach the records server. Start the doctor-portal API on port 5001, then refresh.'
          : status === 404
            ? 'Health records API was not found. Restart the patient app dev server (Vite) so /api/patient routes proxy to port 5001.'
            : msg || 'Failed to load your saved documents.'
      )
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (location.pathname !== '/medical-vault') return
    fetchRecords()
  }, [location.pathname, fetchRecords])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && location.pathname === '/medical-vault') {
        fetchRecords()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [location.pathname, fetchRecords])

  const categories = ['Blood Test', 'Past Consult', 'Prescription', 'Lab Report', 'Imaging', 'Other']

  const openFilePicker = () => {
    if (!isUploading) fileInputRef.current?.click()
  }

  const handleFileUpload = useCallback(async (event) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const file = files[0]

    if (!isAllowedFile(file)) {
      setError('Only PDF and image files are allowed')
      event.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit')
      event.target.value = ''
      return
    }

    setIsUploading(true)
    setError('')
    setSuccess('')
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', uploadCategory || 'Other')

      const response = await patientApi.uploadRecord(formData, {
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size
          const percentCompleted = Math.round((progressEvent.loaded * 100) / total)
          setUploadProgress(percentCompleted)
        },
      })

      if (response.data) {
        setRecords((prev) => [response.data, ...prev])
        setSuccess(`${file.name} uploaded successfully`)
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message
      setError(msg || 'Upload failed. Ensure the doctor portal API is running on port 5001 and you are logged in.')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
      event.target.value = ''
    }
  }, [uploadCategory])

  const handleDelete = async (recordId) => {
    if (!window.confirm('Delete this record? This action cannot be undone.')) return

    try {
      await patientApi.deleteRecord(recordId)
      setRecords((prev) => prev.filter((r) => r._id !== recordId))
      setSuccess('Record deleted successfully')
      setTimeout(() => setSuccess(''), 2000)
    } catch {
      setError('Failed to delete record')
    }
  }

  const filteredRecords =
    selectedCategory === 'all' ? records : records.filter((r) => r.category === selectedCategory)

  return (
    <div className="min-h-full px-6 py-10 sm:px-10">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        onChange={handleFileUpload}
        disabled={isUploading}
        className="hidden"
        aria-hidden
      />

      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[11px] text-slate-500 dark:text-emerald-600/90 font-medium mb-1">
                <span className="text-slate-400 dark:text-emerald-500">Patient</span>
                <span className="mx-1.5 text-slate-300 dark:text-emerald-700">/</span>
                <span className="text-slate-800 dark:text-emerald-200 font-semibold">Health records</span>
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-emerald-50 tracking-tight">
                Medical Vault
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-emerald-200/90 max-w-2xl">
                Securely store and organize your medical records, prescriptions, and lab reports in one place.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-emerald-800/70 bg-white dark:bg-emerald-950/60 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-emerald-100"
                aria-label="Document category"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={openFilePicker}
                disabled={isUploading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-600 disabled:opacity-60"
              >
                <Plus size={16} />
                {isUploading ? 'Uploading...' : 'Upload Record'}
              </button>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {isUploading && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 rounded-[24px] border border-emerald-200 dark:border-emerald-600 bg-emerald-50/90 dark:bg-emerald-950/85 backdrop-blur-md p-6"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">Uploading document...</p>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">{uploadProgress}%</p>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-900">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 rounded-[20px] border border-rose-200 bg-rose-50/80 backdrop-blur-md p-4 text-sm text-rose-700"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 rounded-[20px] border border-emerald-300 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/90 backdrop-blur-md p-4 flex items-center gap-3 text-sm text-emerald-900 dark:text-emerald-100 font-medium shadow-sm shadow-emerald-900/10"
            >
              <CheckCircle2 size={18} />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <Filter size={18} className="text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-semibold text-slate-700 dark:text-emerald-200">Filter by category</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedCategory === 'all'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 dark:shadow-emerald-900/40'
                  : 'bg-slate-100 dark:bg-emerald-950/70 text-slate-700 dark:text-emerald-100 hover:bg-emerald-50 dark:hover:bg-emerald-900 border border-transparent dark:border-emerald-800/60'
              }`}
            >
              All Files
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectedCategory === cat
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 dark:shadow-emerald-900/40'
                    : 'bg-slate-100 dark:bg-emerald-950/70 text-slate-700 dark:text-emerald-100 hover:bg-emerald-50 dark:hover:bg-emerald-900 border border-transparent dark:border-emerald-800/60'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-300/70 dark:border-emerald-700/80 bg-emerald-50/80 dark:bg-emerald-950/50 p-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/80">
                <Folder size={24} className="text-emerald-600 dark:text-emerald-300" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-emerald-50 mb-1.5">No records yet</h3>
              <p className="text-sm text-slate-600 dark:text-emerald-200/90 mb-4">
                Upload your medical documents to keep them organized and accessible.
              </p>
              <button
                type="button"
                onClick={openFilePicker}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-600 transition disabled:opacity-60"
              >
                <Upload size={16} />
                Upload first document
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {filteredRecords.map((record, idx) => (
                  <motion.div
                    key={record._id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group rounded-[24px] border border-emerald-200/80 dark:border-emerald-700/90 bg-emerald-50/70 dark:bg-emerald-950/55 backdrop-blur-lg p-5 shadow-sm shadow-emerald-900/5 dark:shadow-black/30 hover:shadow-lg hover:border-emerald-400/60 dark:hover:border-emerald-500/70 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="rounded-2xl bg-emerald-100 dark:bg-emerald-900/70 p-2.5 flex-shrink-0 border border-emerald-200/50 dark:border-emerald-700/50">
                          {record.fileType?.includes('pdf') ? (
                            <File size={20} className="text-red-600 dark:text-red-400" />
                          ) : (
                            <Eye size={20} className="text-emerald-600 dark:text-emerald-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-50 truncate">{record.originalName}</p>
                          <div className="mt-2 flex flex-col gap-1.5">
                            <p className="text-xs font-medium text-emerald-900/90 dark:text-emerald-300">{record.category}</p>
                            <p className="text-xs text-emerald-800/85 dark:text-emerald-400/95">
                              {new Date(record.uploadedAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={() => patientApi.downloadRecord(record._id).then((res) => {
                            const url = window.URL.createObjectURL(new Blob([res.data]))
                            const a = document.createElement('a')
                            a.href = url
                            a.download = record.originalName
                            a.click()
                            window.URL.revokeObjectURL(url)
                          }).catch(() => setError('Download failed'))}
                          className="rounded-lg bg-emerald-100 dark:bg-emerald-900 p-2 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-800 transition border border-emerald-200/60 dark:border-emerald-700/60"
                          title="Download"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(record._id)}
                          className="rounded-lg bg-rose-50 dark:bg-rose-950/50 p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition border border-rose-200/60 dark:border-rose-800/60"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

export default MedicalVault
