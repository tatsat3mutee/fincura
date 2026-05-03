import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { User } from '../types'

export default function OAuthCallback() {
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const error = params.get('error')

    if (error || !token) {
      navigate('/login?error=' + (error ?? 'oauth_failed'))
      return
    }

    localStorage.setItem('token', token)
    api.get<User>('/auth/me')
      .then(user => {
        login(token, user)
        navigate('/dashboard')
      })
      .catch(() => {
        localStorage.removeItem('token')
        navigate('/login?error=auth_failed')
      })
  }, [])

  return <div className="app-loading">Signing you in…</div>
}
