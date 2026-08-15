import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { registerGlobalErrorHandlers } from './lib/globalErrorHandlers'
import { applyTheme, loadTheme } from './store/layout'
import './index.css'

registerGlobalErrorHandlers()

// Before the first render, so the page never paints in the wrong theme and then
// corrects itself.
applyTheme(loadTheme())

// Following the OS only counts while the choice *is* "system" — an explicit
// light must survive the machine switching to dark at sunset.
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (loadTheme() === 'system') applyTheme('system')
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
