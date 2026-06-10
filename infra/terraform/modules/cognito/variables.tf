variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "domain_name" {
  description = "Public website domain (e.g. ariaeval.io)"
  type        = string
  default     = ""
}

variable "domain_prefix" {
  description = "Optional Cognito hosted UI domain prefix override."
  type        = string
  default     = ""
}

variable "google_client_id" {
  type = string
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "apple_client_id" {
  description = "Apple Services ID (client_id) for Sign in with Apple via Cognito."
  type        = string
  default     = ""
}

variable "apple_team_id" {
  description = "Apple Developer Team ID."
  type        = string
  default     = ""
}

variable "apple_key_id" {
  description = "Apple Sign in with Apple key ID."
  type        = string
  default     = ""
}

variable "apple_private_key" {
  description = "Apple private key (PEM) used by Cognito to authenticate against Apple."
  type        = string
  sensitive   = true
  default     = ""
}

variable "callback_urls" {
  description = "OAuth callback URLs for the Cognito app client."
  type        = list(string)
  default     = []
}

variable "logout_urls" {
  description = "Logout redirect URLs for the Cognito app client."
  type        = list(string)
  default     = []
}
