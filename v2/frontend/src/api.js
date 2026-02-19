import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
})

export function setToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

export async function loginStaff(email, password) {
  const { data } = await api.post('/v1/backoffice/auth/login', { email, password })
  return data
}

export async function fetchDoors() {
  const { data } = await api.get('/v1/backoffice/doors')
  return data
}

export async function fetchEvents() {
  const { data } = await api.get('/v1/backoffice/events')
  return data
}

export async function fetchGrants() {
  const { data } = await api.get('/v1/backoffice/grants')
  return data
}

export async function assignGrant(payload) {
  const { data } = await api.post('/v1/backoffice/assign', payload)
  return data
}

export async function revokeGrant(grant_id) {
  const { data } = await api.post('/v1/backoffice/revoke', { grant_id })
  return data
}
