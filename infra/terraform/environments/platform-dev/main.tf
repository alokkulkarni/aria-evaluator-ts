# environments/platform-dev — REFERENCE wiring of the shared platform + example
# per-tenant services. Validated (fmt/validate/plan) but NOT applied: it demonstrates
# how the control-plane will compose the modules in Phase 6. See docs/MULTI_TENANT_SPEC.md.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 7.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      "aria:platform"    = "shared"
      "aria:environment" = var.environment
      "aria:managed-by"  = "terraform"
    }
  }
}

locals {
  tags = {
    "aria:platform"    = "shared"
    "aria:environment" = var.environment
  }

  # Example tenants. In Phase 6 the control-plane creates one tenant-service per
  # signup with an allocated listener_rule_priority (unique per tenant).
  tenants = {
    acme   = { priority = 100 }
    globex = { priority = 110 }
  }
}

module "platform" {
  source = "../../modules/platform"

  app_name            = var.app_name
  environment         = var.environment
  domain              = var.domain
  route53_zone_id     = var.route53_zone_id
  acm_certificate_arn = var.acm_certificate_arn

  # Dev convenience — destroyable.
  aurora_deletion_protection     = false
  alb_enable_deletion_protection = false
  state_bucket_force_destroy     = true

  control_plane_role_name = var.control_plane_role_name
  tags                    = local.tags
}

module "tenant_service" {
  for_each = local.tenants
  source   = "../../modules/tenant-service"

  app_name    = var.app_name
  environment = var.environment
  aws_region  = var.aws_region

  tenant_id              = each.key
  host                   = "${each.key}.${var.domain}"
  app_image_uri          = var.app_image_uri
  listener_rule_priority = each.value.priority

  cluster_arn             = module.platform.cluster_arn
  cluster_name            = module.platform.cluster_name
  vpc_id                  = module.platform.vpc_id
  private_subnet_ids      = module.platform.private_subnet_ids
  tenant_ecs_sg_id        = module.platform.tenant_ecs_sg_id
  alb_https_listener_arn  = module.platform.alb_https_listener_arn
  database_url_secret_arn = module.platform.database_url_secret_arn
  execution_role_arn      = module.platform.execution_role_arn
  task_role_arn           = module.platform.task_role_arn
  state_bucket_name       = module.platform.state_bucket_name
  redis_host              = module.platform.redis_host
  redis_port              = module.platform.redis_port

  control_plane_internal_url = var.control_plane_internal_url
  website_url                = var.website_url

  tags = local.tags
}
