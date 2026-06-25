output "app_url" {
  description = "URL where the aria-evaluator dashboard is accessible"
  value       = "http://localhost:3001"
}

output "admin_login_hint" {
  description = "How to find the auto-created default admin credentials"
  value       = "docker compose logs aria-evaluator | grep -A4 'default admin'"
}

output "logs_hint" {
  description = "Tail the stack logs"
  value       = "docker compose logs -f"
}
