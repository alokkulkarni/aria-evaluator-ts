import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'

const authSecret =
  process.env.NEXTAUTH_SECRET ??
  process.env.AUTH_SECRET ??
  'aria-website-default-secret-change-me'

if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
  console.warn('[auth] NEXTAUTH_SECRET is not set; using fallback secret. Set NEXTAUTH_SECRET for production.')
}

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
      void credentials
      console.warn('[STUB] Credentials auth - wire to control plane in Phase 1')
      return null
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
        session.user.isNewUser = token.isNewUser as boolean | undefined
      }

      return session
    },
    async jwt({ token, user, trigger }) {
      if (trigger === 'signIn' && user) {
        token.isNewUser = true
      }

      return token
    },
  },
  session: { strategy: 'jwt' },
  secret: authSecret,
})
