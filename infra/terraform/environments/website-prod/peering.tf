# ── Cross-VPC connectivity: auth-backend ⟶ control-plane internal ALB ─────────
#
# The control-plane stack lives in its own VPC (10.62.0.0/16) and exposes its
# API on an INTERNAL ALB. The auth-backend (this stack, VPC 10.61.0.0/16) needs
# to reach `/auth/oauth` etc. via `CONTROL_PLANE_INTERNAL_URL` — so we build a
# same-account VPC peering connection and wire routes + an SG ingress rule.
#
# Disabled when control_plane_url is empty (e.g. fresh stand-up before the
# control-plane has been deployed).

data "terraform_remote_state" "control_plane" {
  count   = var.control_plane_url != "" ? 1 : 0
  backend = "s3"
  config = {
    bucket = var.terraform_state_bucket
    key    = "control-plane/prod/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  peering_enabled         = var.control_plane_url != ""
  control_plane_state     = try(data.terraform_remote_state.control_plane[0].outputs, null)
  control_plane_vpc_id    = try(local.control_plane_state.vpc_id, "")
  control_plane_vpc_cidr  = try(local.control_plane_state.vpc_cidr, "")
  # Use ALL route tables on the control-plane side (public + private), because
  # the internal ALB's ENIs live in PUBLIC subnets (see investigation notes
  # 2026-06-12). If we only routed via the private RTs, the SYN-ACK from the
  # ALB drops on the floor and the auth-backend sees a ConnectTimeout.
  control_plane_rt_ids = try(local.control_plane_state.all_route_table_ids, [])
  control_plane_alb_sg_id = try(local.control_plane_state.alb_security_group_id, "")
}

resource "aws_vpc_peering_connection" "auth_to_control_plane" {
  count       = local.peering_enabled ? 1 : 0
  vpc_id      = module.auth_backend.vpc_id
  peer_vpc_id = local.control_plane_vpc_id
  # peer_region is intentionally omitted: the AWS provider rejects it when
  # auto_accept = true and the peer is in the same region. For same-account,
  # same-region peering, the requester region is used implicitly.
  auto_accept = true

  tags = merge(local.common_tags, {
    Name = "aria-auth-prod-to-control-plane-prod"
    Side = "requester"
  })
}

# Route from auth VPC public subnets → control-plane CIDR via peering.
# depends_on is implicit (route references the peering), kept here for clarity.
resource "aws_route" "auth_to_control_plane" {
  count                     = local.peering_enabled ? 1 : 0
  route_table_id            = module.auth_backend.public_route_table_id
  destination_cidr_block    = local.control_plane_vpc_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection.auth_to_control_plane[0].id
}

# Reverse routes: every control-plane route table → auth VPC CIDR.
# Lives in this stack (not control-plane-prod) so the peering and both ends
# of the routing change atomically when control_plane_url is set.
#
# Uses for_each keyed on the route-table ID (not count) so each route's
# Terraform address is stable. With count, reordering `all_route_table_ids`
# shifts indices and forces destroy+recreate, which orphans the live AWS
# route and produces "RouteAlreadyExists" on re-apply.
resource "aws_route" "control_plane_to_auth" {
  for_each                  = local.peering_enabled ? toset(local.control_plane_rt_ids) : toset([])
  route_table_id            = each.key
  destination_cidr_block    = module.auth_backend.vpc_cidr_block
  vpc_peering_connection_id = aws_vpc_peering_connection.auth_to_control_plane[0].id
}

# Allow the auth-backend ECS task SG to reach the control-plane ALB on HTTP (80).
# Cross-VPC SG references require the peering to exist first — without depends_on
# Terraform creates this in parallel with the peering and AWS rejects it with
# "two resources that belong to different networks".
resource "aws_security_group_rule" "control_plane_alb_from_auth" {
  count                    = local.peering_enabled ? 1 : 0
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  security_group_id        = local.control_plane_alb_sg_id
  source_security_group_id = module.auth_backend.ecs_security_group_id
  description              = "auth-backend ECS to control-plane ALB (peered VPCs)"

  depends_on = [aws_vpc_peering_connection.auth_to_control_plane]
}
