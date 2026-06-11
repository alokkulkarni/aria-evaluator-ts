import { signIn } from 'next-auth/react'

export type SocialProvider = 'google' | 'github'

/**
 * Initiates OAuth sign-in with the given provider.
 * next-auth handles the redirect to the provider's auth page.
 */
export async function signInWithSocialProvider(
  provider: SocialProvider,
  callbackUrl: string,
): Promise<void> {
  await signIn(provider, { callbackUrl })
}
