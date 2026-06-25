output "peering_connection_id" {
  description = "VPC peering connection joining the evaluator and control-plane VPCs"
  value       = aws_vpc_peering_connection.evaluator_to_control_plane.id
}
