import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
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
  ],
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
  secret: process.env.NEXTAUTH_SECRET,
})
