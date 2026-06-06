import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import { serverApiFetch } from '@/lib/api'

interface ControlPlaneUser {
  id: string
  email: string
  name?: string | null
  role?: 'owner' | 'admin' | 'member'
  tenantId?: string
  accessToken?: string
  isNewUser?: boolean
}

const authSecret = (() => {
  const configured = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (configured) return configured

  const deployEnv = (process.env.ARIA_DEPLOY_ENV ?? process.env.ENVIRONMENT ?? '').toLowerCase()
  if (deployEnv === 'prod' || deployEnv === 'production') {
    throw new Error('NEXTAUTH_SECRET or AUTH_SECRET is required in production')
  }

  console.warn('[auth] NEXTAUTH_SECRET is not set; using fallback secret. Set NEXTAUTH_SECRET for production.')
  return 'aria-website-default-secret-change-me'
})()

const providers = [
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ]
    : []),
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? [
        GitHub({
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        }),
      ]
    : []),
  Credentials({
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === 'string' ? credentials.email.trim() : ''
      const password = typeof credentials?.password === 'string' ? credentials.password : ''
      if (!email || !password) return null

      const response = await serverApiFetch<{ user: ControlPlaneUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      return response.user
    },
  }),
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  trustHost: true,
  pages: {
    signIn: '/sign-in',
    newUser: '/sign-up',
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub
        session.user.isNewUser = token.isNewUser as boolean | undefined
        session.user.role = token.role as 'owner' | 'admin' | 'member' | undefined
        session.user.tenantId = token.tenantId as string | undefined
        session.user.accessToken = token.accessToken as string | undefined
      }

      return session
    },
    async jwt({ token, user, trigger }) {
      if (trigger === 'signIn' && user) {
        token.isNewUser = (user as ControlPlaneUser).isNewUser
        token.role = (user as ControlPlaneUser).role
        token.tenantId = (user as ControlPlaneUser).tenantId
        token.accessToken = (user as ControlPlaneUser).accessToken
      }

      return token
    },
  },
  session: { strategy: 'jwt' },
  secret: authSecret,
})
