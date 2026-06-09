// Re-export API utilities from the shared website source via path alias
export { apiFetch, serverApiFetch, ApiError } from '@shared/lib/api'
export type { RegisterUserResponse, CreateTenantResponse } from '@shared/lib/api'
