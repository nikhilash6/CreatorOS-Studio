import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { brancherCleComfy } from './lib/comfyKey'
import { brancherCleProprietaire } from './lib/proprietaire'

brancherCleComfy()
brancherCleProprietaire()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
