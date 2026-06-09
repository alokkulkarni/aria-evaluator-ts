import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { ApiError, serverApiFetch } from '@/lib/api'

interface GetInstanceResponse {
  instance_url?: string
  status?: string
  message?: string
}

/**
 * GET /api/get-instance-url
 * Retrieves the user's evaluator instance URL (for login routing)
 * 
 * Response:
 * {
 *   instance_url: "https://...",  // User's instance URL
 *   status: "active"               // active, suspended, provisioning, or null if not created
 * }
 * 
 * If instance is suspended, automatically reactivates it
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  const user_id = session?.user?.id

  if (!user_id) {
    return NextResponse.json(
      { instance_url: null, status: null },
      { status: 200 }
    )
  }

  try {
    const authToken = session?.user?.accessToken

    if (!authToken) {
      return NextResponse.json(
        { instance_url: null, status: null },
        { status: 200 }
      )
    }

    // Call control-plane to get instance URL and status
    const result = await serverApiFetch<GetInstanceResponse>(
      '/instance-url',
      {
        method: 'GET',
        authToken,
      }
    )

    // If instance is suspended, reactivate it by calling the reactivation endpoint
    if (result.status === 'suspended' && result.instance_url) {
      try {
        await serverApiFetch(
          '/reactivate-instance',
          {
            method: 'POST',
            authToken,
          }
        )
        // Return reactivated instance URL
        return NextResponse.json({
          instance_url: result.instance_url,
          status: 'active',
        })
      } catch (reactivateErr: unknown) {
        console.warn('Failed to reactivate instance:', reactivateErr)
        // Still return the URL even if reactivation fails
        return NextResponse.json(result)
      }
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      // If endpoint doesn't exist, return null (instance not created)
     if ((err as ApiError).status === 404) {
        return NextResponse.json({
          instance_url: null,
          status: null,
        })
      }
      console.error('Error retrieving instance URL:', err)
      return NextResponse.json(
       { error: (err as ApiError).message },
       { status: (err as ApiError).status }
      )
    }

    console.error('Unexpected error:', err)
    return NextResponse.json(
      { instance_url: null, status: null },
      { status: 200 }
    )
  }
}
