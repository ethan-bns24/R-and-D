import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const THEME_KEY = 'grms_theme'
const ThemeContext = createContext(null)

function readTheme() {
  if (typeof window === 'undefined') return 'dark'
  const saved = window.localStorage.getItem(THEME_KEY)
  return saved === 'carbon' ? 'carbon' : 'dark'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((prev) => (prev === 'dark' ? 'carbon' : 'dark')),
      setTheme: (nextTheme) => {
        if (nextTheme !== 'dark' && nextTheme !== 'carbon') return
        setTheme(nextTheme)
      },
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
