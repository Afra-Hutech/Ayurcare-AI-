import React from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from './context/ThemeContext'
import App from './App'
import './index.css'

initTheme()

const container = document.getElementById('root')
const root = createRoot(container)
root.render(<App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
