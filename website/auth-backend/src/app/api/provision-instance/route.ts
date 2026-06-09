import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { ApiError, serverApiFetch } from '@/lib/api'

interface ProvisionRequest {
  plan_type?: string
}

interface ProvisionResponse {
  build_id: string
  user_id: string
  message: string
}

/**
 * POST /api/provision-instance
 * Triggers provisioning of a new evaluator instance for the user
 * 
 * Request body:
 * {
 *   plan_type: "free" | "pro" | "enterprise"  // Required
 * }
 * 
 * Response:
 * {
 *   build_id: "string",
 *   user_id: "string",
 *   message: "Instance provisioning started"
 * }
 */
export async function POST(request: NextRequest) {
  const session = await auth()
  const user_id = session?.user?.id

  if (!user_id) {
    return NextResponse.json(
      { error: 'Unauthorized: No user session' },
      { status: 401 }
    )
  }

  try {
    const body = (await request.json()) as ProvisionRequest

    if (!body.plan_type) {
      return NextResponse.json(
        { error: 'Missing required field: plan_type' },
        { status: 400 }
      )
    }

    const authToken = session?.user?.accessToken

    if (!authToken) {
      return NextResponse.json(
        { error: 'Unauthorized: No auth token' },
        { status: 401 }
      )
    }

    // Call control-plane provisioning Lambda API
    const result = await serverApiFetch<ProvisionResponse>(
      '/provision-evaluator',
      {
        method: 'POST',
        authToken,
        body: JSON.stringify({
          user_id,
          plan_type: body.plan_type,
        }),
      }
    )

    return NextResponse.json(result, { status: 202 })
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        return NextResponse.json(
          { error: 'Instance already exists', statusCode: 409 },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error('Provisioning error:', err)
    return NextResponse.json(
      { error: 'Failed to provision instance' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/provision-instance/status/{buildId}
 * Check provisioning status
 */
export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const url = new URL(request.url)
    const buildId = url.searchParams.get('buildId')

    if (!buildId) {
      return NextResponse.json(
        { error: 'Missing required parameter: buildId' },
        { status: 400 }
      )
    }

    const authToken = session?.user?.accessToken

    if (!authToken) {
      return NextResponse.json(
        { error: 'Unauthorized: No auth token' },
        { status: 401 }
      )
    }

    // Call control-plane provision status endpoint
    const result = await serverApiFetch(
      `/provision-status/${buildId}`,
      {
        method: 'GET',
        authToken,
      }
    )

    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }

    console.error('Status check error:', err)
    return NextResponse.json(
      { error: 'Failed to check provisioning status' },
      { status: 500 }
    )
  }
}
