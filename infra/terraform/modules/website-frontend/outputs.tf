output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "s3_bucket_name" {
  value = aws_s3_bucket.static.id
}

output "s3_bucket_arn" {
  value = aws_s3_bucket.static.arn
}

output "website_url" {
  value = local.app_url
}
