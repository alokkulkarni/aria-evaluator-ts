import NextAuth from 'next-auth'
import Cognito from 'next-auth/providers/cognito'
import Credentials from 'next-auth/providers/credentials'
import { ApiError, serverApiFetch } from '@/lib/api'

type AuthProvider = 'email' | 'google' | 'apple'

interface ControlPlaneUser {
  id: string
  email: string
  name?: string | null
  authProvider?: AuthProvider
  role?: 'owner' | 'admin' | 'member'
  tenantId?: string
  accessToken?: string
  isNewUser?: boolean
}

function getSocialProviderFromCognitoProfile(profile: unknown): AuthProvider | null {
  if (!profile || typeof profile !== 'object') return null
  const candidate = profile as Record<string, unknown>

  const identitiesRaw = candidate.identities
  if (typeof identitiesRaw === 'string') {
    try {
      const identities = JSON.parse(identitiesRaw) as Array<Record<string, unknown>>
      const providerName = identities[0]?.providerName
      if (providerName === 'Google') return 'google'
      if (providerName === 'SignInWithApple' || providerName === 'Apple') return 'apple'
    } catch {
      // fall through to other hints in the profile payload
    }
  }

  const cognitoUsername = candidate['cognito:username']
  if (typeof cognitoUsername === 'string') {
    if (cognitoUsername.startsWith('Google_')) return 'google'
    if (cognitoUsername.startsWith('SignInWithApple_') || cognitoUsername.startsWith('Apple_')) return 'apple'
  }

  return null
}

function parseApiErrorPayload(raw: string): { code?: string; provider?: AuthProvider } | null {
  try {
    return JSON.parse(raw) as { code?: string; provider?: AuthProvider }
  } catch {
    return null
  }
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

const useCognitoSocialAuth = Boolean(
  process.env.COGNITO_CLIENT_ID &&
    process.env.COGNITO_CLIENT_SECRET &&
    process.env.COGNITO_ISSUER,
)

const providers = [
  ...(useCognitoSocialAuth
    ? [
        Cognito({
          clientId: process.env.COGNITO_CLIENT_ID!,
          clientSecret: process.env.COGNITO_CLIENT_SECRET!,
          issuer: process.env.COGNITO_ISSUER!,
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
  pages: {
    signIn: '/sign-in',
    newUser: '/sign-up',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials') return true

      const provider = account.provider === 'cognito' ? getSocialProviderFromCognitoProfile(profile) : null
      if (!provider) return '/sign-in?error=social_signin_failed'

      const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : ''
      if (!email) return `/sign-in?error=missing_social_email&provider=${provider}`

      try {
        const response = await serverApiFetch<{ user: ControlPlaneUser }>('/auth/oauth', {
          method: 'POST',
          body: JSON.stringify({
            provider,
            email,
            name: typeof user.name === 'string' ? user.name : null,
          }),
        })

        const cpUser = response.user
        user.id = cpUser.id
        user.email = cpUser.email
        user.name = cpUser.name ?? user.name
        ;(user as ControlPlaneUser).authProvider = cpUser.authProvider
        ;(user as ControlPlaneUser).isNewUser = cpUser.isNewUser
        ;(user as ControlPlaneUser).role = cpUser.role
        ;(user as ControlPlaneUser).tenantId = cpUser.tenantId
        ;(user as ControlPlaneUser).accessToken = cpUser.accessToken

        return true
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const payload = parseApiErrorPayload(error.message)
          if (payload?.code === 'EMAIL_EXISTS_WITH_DIFFERENT_PROVIDER' && payload.provider) {
            return `/sign-in?error=email_provider_mismatch&provider=${payload.provider}`
          }
        }

        return `/sign-in?error=social_signin_failed&provider=${provider}`
      }
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub
        if (token.email) session.user.email = token.email as string
        if (token.name) session.user.name = token.name as string
        session.user.authProvider = token.authProvider as AuthProvider | undefined
        session.user.isNewUser = token.isNewUser as boolean | undefined
        session.user.role = token.role as 'owner' | 'admin' | 'member' | undefined
        session.user.tenantId = token.tenantId as string | undefined
        session.user.accessToken = token.accessToken as string | undefined
      }

      return session
    },
    async jwt({ token, user, trigger }) {
      if (trigger === 'signIn' && user) {
        token.authProvider = (user as ControlPlaneUser).authProvider
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
