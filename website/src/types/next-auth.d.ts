import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id?: string
      authProvider?: 'email' | 'google' | 'github'
      isNewUser?: boolean
      role?: 'owner' | 'admin' | 'member'
      tenantId?: string
      accessToken?: string
      plan?: string
    }
  }

  interface User {
    authProvider?: 'email' | 'google' | 'github'
    isNewUser?: boolean
    role?: 'owner' | 'admin' | 'member'
    tenantId?: string
    accessToken?: string
    plan?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    authProvider?: 'email' | 'google' | 'github'
    isNewUser?: boolean
    role?: 'owner' | 'admin' | 'member'
    tenantId?: string
    accessToken?: string
    plan?: string
  }
}
