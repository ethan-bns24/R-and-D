import { useTheme } from '../theme/ThemeProvider'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button type="button" className="ghost-button" onClick={toggleTheme}>
      Theme: {theme === 'dark' ? 'Noir' : 'Carbon'}
    </button>
  )
}
