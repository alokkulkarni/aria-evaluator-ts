output "control_plane_url" {
  value = "http://${module.alb.alb_dns_name}"
}
