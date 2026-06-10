output "user_pool_id" {
  value       = aws_cognito_user_pool.main.id
  description = "Cognito User Pool ID"
}

output "user_pool_arn" {
  value       = aws_cognito_user_pool.main.arn
  description = "Cognito User Pool ARN"
}

output "user_pool_domain_prefix" {
  value       = aws_cognito_user_pool_domain.main.domain
  description = "Hosted UI domain prefix"
}

output "user_pool_domain_fqdn" {
  value       = "${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
  description = "Hosted UI domain FQDN"
}

output "issuer" {
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  description = "OIDC issuer URL for Cognito"
}

output "app_client_id" {
  value       = aws_cognito_user_pool_client.web.id
  description = "Cognito App Client ID"
}

output "app_client_secret" {
  value       = aws_cognito_user_pool_client.web.client_secret
  sensitive   = true
  description = "Cognito App Client secret"
}

output "idp_response_url" {
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.region}.amazoncognito.com/oauth2/idpresponse"
  description = "Configure this callback URL in Google and Apple app settings."
}

output "authorize_url" {
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.region}.amazoncognito.com/oauth2/authorize"
  description = "Hosted UI authorize endpoint"
}

output "token_url" {
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.region}.amazoncognito.com/oauth2/token"
  description = "Hosted UI token endpoint"
}

output "apple_enabled" {
  value       = length(aws_cognito_identity_provider.apple) > 0
  description = "Whether Sign in with Apple is enabled in Cognito."
}
