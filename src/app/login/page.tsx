'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold mb-2 text-center text-gray-900">GHMD Sales</h1>
        <p className="text-sm text-gray-500 text-center mb-6">Sign in to continue</p>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4681A3]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4681A3]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4681A3] text-white py-2 rounded-md text-sm font-medium hover:bg-[#3a6e8c] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  )
}
