// У шрифта заголовков полный набор включает японские символы (сотни файлов,
// 170 КБ CSS) — берём только кириллицу и латиницу.
import '@fontsource/dela-gothic-one/cyrillic-400.css'
import '@fontsource/dela-gothic-one/latin-400.css'
import '@fontsource-variable/onest'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/app.scss'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
