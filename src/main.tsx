import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ContextProvider } from '@epam/uui-core'
import { Modals, Snackbar } from '@epam/uui-components'
import '@epam/uui-components/styles.css'
import '@epam/uui/styles.css'
import '@epam/assets/css/theme/theme_loveship.css'
import './index.css'
import App from './App.tsx'

document.body.classList.add('uui-theme-loveship')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ContextProvider onInitCompleted={() => {}}>
      <App />
      <Snackbar />
      <Modals />
    </ContextProvider>
  </StrictMode>,
)
