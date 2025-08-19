// src/main.tsx
import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

class ErrorBoundary extends React.Component<{}, { hasError: boolean; err?: any }> {
  constructor(props: {}) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, err }
  }
  componentDidCatch(err: any, info: any) {
    console.error('ErrorBoundary caught:', err, info)
  }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: 16 }}>💥 Something blew up. Check the console.</div>
    }
    return this.props.children as any
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ padding: 8, fontFamily: 'monospace' }}>booting…</div>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)