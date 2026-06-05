import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id?: string
      isNewUser?: boolean
      role?: 'owner' | 'admin' | 'member'
      tenantId?: string
    }
  }

  interface User {
    isNewUser?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isNewUser?: boolean
  }
}
