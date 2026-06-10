data "aws_region" "current" {}

locals {
  cognito_domain_prefix = trimspace(var.domain_prefix) != "" ? var.domain_prefix : "${var.app_name}-${var.environment}-auth"

  default_callback_urls = var.domain_name != "" ? ["https://${var.domain_name}/api/auth/callback/cognito"] : ["http://localhost:3000/api/auth/callback/cognito"]
  default_logout_urls   = var.domain_name != "" ? ["https://${var.domain_name}/sign-out"] : ["http://localhost:3000/sign-out"]

  apple_enabled = trimspace(var.apple_client_id) != "" && trimspace(var.apple_team_id) != "" && trimspace(var.apple_key_id) != "" && trimspace(var.apple_private_key) != ""

  supported_identity_providers = concat(
    ["COGNITO", "Google"],
    local.apple_enabled ? ["SignInWithApple"] : [],
  )
}

resource "aws_cognito_user_pool" "main" {
  name                     = "${var.app_name}-${var.environment}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  tags = {
    Name        = "${var.app_name}-${var.environment}-users"
    Environment = var.environment
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = local.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    picture  = "picture"
    username = "sub"
  }
}

resource "aws_cognito_identity_provider" "apple" {
  count = local.apple_enabled ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "SignInWithApple"
  provider_type = "SignInWithApple"

  provider_details = {
    client_id        = var.apple_client_id
    team_id          = var.apple_team_id
    key_id           = var.apple_key_id
    private_key      = var.apple_private_key
    authorize_scopes = "email name"
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  user_pool_id = aws_cognito_user_pool.main.id
  name         = "${var.app_name}-${var.environment}-web"

  generate_secret = true

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = local.supported_identity_providers

  callback_urls = length(var.callback_urls) > 0 ? var.callback_urls : local.default_callback_urls
  logout_urls   = length(var.logout_urls) > 0 ? var.logout_urls : local.default_logout_urls

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  depends_on = [
    aws_cognito_identity_provider.google,
    aws_cognito_identity_provider.apple,
  ]
}
