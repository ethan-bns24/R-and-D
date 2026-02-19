export function defaultRange() {
  return {
    from_local: new Date(Date.now() - 3600e3).toISOString().slice(0, 16),
    to_local: new Date(Date.now() + 86400e3).toISOString().slice(0, 16),
  }
}

export function toUnix(datetimeLocal) {
  return datetimeLocal ? Math.floor(new Date(datetimeLocal).getTime() / 1000) : 0
}

export function fmtTs(ts) {
  return ts ? new Date(ts * 1000).toLocaleString() : '-'
}

export function shortId(value) {
  return value ? `${value.slice(0, 8)}...` : '-'
}
