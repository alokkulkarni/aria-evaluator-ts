output "distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "distribution_arn" {
  description = "ARN of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.arn
}

output "distribution_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_url" {
  description = "Full HTTPS URL of the CloudFront distribution"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "distribution_hosted_zone_id" {
  description = "Hosted zone ID of the CloudFront distribution (for Route 53 alias records)"
  value       = aws_cloudfront_distribution.main.hosted_zone_id
}

output "static_cache_policy_id" {
  description = "ID of the static asset cache policy"
  value       = aws_cloudfront_cache_policy.static.id
}

output "no_cache_policy_id" {
  description = "ID of the no-cache policy"
  value       = aws_cloudfront_cache_policy.no_cache.id
}
