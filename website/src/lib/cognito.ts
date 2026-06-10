import { signIn } from 'next-auth/react'

export type SocialProvider = 'google' | 'apple'

const cognitoIdentityProviderMap: Record<SocialProvider, 'Google' | 'SignInWithApple'> = {
  google: 'Google',
  apple: 'SignInWithApple',
}

export async function signInWithSocialProvider(provider: SocialProvider, callbackUrl: string): Promise<void> {
  await signIn('cognito', { callbackUrl }, { identity_provider: cognitoIdentityProviderMap[provider] })
}
