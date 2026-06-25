# ── connectivity-prod: cross-VPC link between evaluator-prod and control-plane-prod ──
#
# This stack owns the shared resources that join the pooled evaluator VPC to the
# control-plane VPC so the evaluator can reach the internal control-plane ALB for
# the SSO verify call (/auth/sso → /auth/verify-sso-token):
#   • the VPC peering connection (evaluator VPC ⟷ control-plane 10.62.0.0/16)
#   • the routes in every evaluator RT toward the control-plane CIDR
#   • the reverse routes in every control-plane RT toward the evaluator CIDR
#   • the ingress rule on the control-plane internal ALB SG from the evaluator ECS SG
#
# Why a separate stack: keeping the peering here (rather than inside an app stack)
# lets each app `terraform destroy` independently without the peering pinning the
# control-plane VPC.
#
# ── Lifecycle / runbook ───────────────────────────────────────────────────────
#   SETUP:    apply control-plane-prod + evaluator-prod, THEN apply connectivity-prod.
#   TEARDOWN: destroy connectivity-prod FIRST, then control-plane-prod and
#             evaluator-prod independently, in any order.
#
# Reads both app stacks' outputs via remote state — no hand-copied IDs.

data "terraform_remote_state" "control_plane" {
  backend = "s3"
  config = {
    bucket = var.terraform_state_bucket
    key    = var.control_plane_state_key
    region = var.aws_region
  }
}

data "terraform_remote_state" "evaluator" {
  backend = "s3"
  config = {
    bucket = var.terraform_state_bucket
    key    = var.evaluator_state_key
    region = var.aws_region
  }
}

locals {
  control_plane_vpc_id    = data.terraform_remote_state.control_plane.outputs.vpc_id
  control_plane_vpc_cidr  = data.terraform_remote_state.control_plane.outputs.vpc_cidr
  control_plane_alb_sg_id = data.terraform_remote_state.control_plane.outputs.alb_security_group_id
  # ALL control-plane route tables (public + private): the internal ALB's ENIs
  # live in PUBLIC subnets, so routing only via private RTs drops the SYN-ACK and
  # the auth-backend sees a ConnectTimeout.
  control_plane_rt_ids = data.terraform_remote_state.control_plane.outputs.all_route_table_ids

  # Evaluator stack (pooled multi-tenant evaluator) — needs to reach the internal
  # control-plane ALB for the SSO verify call (/auth/sso → /auth/verify-sso-token).
  evaluator_vpc_id    = data.terraform_remote_state.evaluator.outputs.vpc_id
  evaluator_vpc_cidr  = data.terraform_remote_state.evaluator.outputs.vpc_cidr
  evaluator_rt_ids    = data.terraform_remote_state.evaluator.outputs.all_route_table_ids
  evaluator_ecs_sg_id = data.terraform_remote_state.evaluator.outputs.ecs_service_security_group_id

  common_tags = merge(var.tags, {
    Project              = "aria-evaluator"
    Environment          = "prod"
    Component            = "connectivity"
    "aria:pricing_track" = "platform"
  })
}

# ── Evaluator ⟷ control-plane peering ─────────────────────────────────────────
# The pooled evaluator (its own VPC) must reach the internal control-plane ALB to
# verify SSO tokens. Same pattern as the auth↔control-plane link above.

resource "aws_vpc_peering_connection" "evaluator_to_control_plane" {
  vpc_id      = local.evaluator_vpc_id
  peer_vpc_id = local.control_plane_vpc_id
  auto_accept = true

  tags = merge(local.common_tags, {
    Name = "aria-evaluator-prod-to-control-plane-prod"
  })
}

# Evaluator route tables → control-plane CIDR via peering.
resource "aws_route" "evaluator_to_control_plane" {
  for_each                  = toset(local.evaluator_rt_ids)
  route_table_id            = each.key
  destination_cidr_block    = local.control_plane_vpc_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.evaluator_to_control_plane.id
}

# Reverse routes: every control-plane route table → evaluator VPC CIDR.
resource "aws_route" "control_plane_to_evaluator" {
  for_each                  = toset(local.control_plane_rt_ids)
  route_table_id            = each.key
  destination_cidr_block    = local.evaluator_vpc_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.evaluator_to_control_plane.id
}

# Allow the evaluator ECS task SG to reach the control-plane internal ALB on 80.
resource "aws_security_group_rule" "control_plane_alb_from_evaluator" {
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  security_group_id        = local.control_plane_alb_sg_id
  source_security_group_id = local.evaluator_ecs_sg_id
  description              = "evaluator ECS to control-plane ALB (peered VPCs)"

  depends_on = [aws_vpc_peering_connection.evaluator_to_control_plane]
}
