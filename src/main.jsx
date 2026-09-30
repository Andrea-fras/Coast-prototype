import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import PhoneGate from './components/PhoneGate/PhoneGate.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PhoneGate>
      <AuthProvider>
        <App />
      </AuthProvider>
    </PhoneGate>
  </StrictMode>,
)
