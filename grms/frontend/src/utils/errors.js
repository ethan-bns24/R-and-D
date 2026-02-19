function normalizeValidationError(item) {
  if (!item || typeof item !== 'object') return ''
  const path = Array.isArray(item.loc)
    ? item.loc.filter((segment) => segment !== 'body').join('.')
    : ''
  let msg = item.msg || item.type || ''
  if (item.type === 'string_too_short' && item?.ctx?.min_length) {
    msg = `minimum ${item.ctx.min_length} caracteres`
  }
  if (item.type === 'string_too_long' && item?.ctx?.max_length) {
    msg = `maximum ${item.ctx.max_length} caracteres`
  }
  if (item.type === 'value_error' && !msg && typeof item.input !== 'undefined') {
    msg = 'valeur invalide'
  }
  if (!path && !msg) return ''
  return path ? `${path}: ${msg}` : msg
}

export function parseApiError(error, fallback = 'Erreur API') {
  const detail = error?.response?.data?.detail

  if (Array.isArray(detail)) {
    const parts = detail.map(normalizeValidationError).filter(Boolean)
    if (parts.length) return parts.join(' | ')
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message
  }

  return fallback
}
