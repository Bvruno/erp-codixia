import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/logger";

export async function insertAuditLog(
  supabase: SupabaseClient,
  organizationId: string,
  action: string,
  entity: string,
  before?: unknown,
  after?: unknown,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    user_id: user?.id ?? null,
    action,
    entity,
    before: before ?? null,
    after: after ?? null,
  });
  if (error) {
    // Fallo de auditoría nunca debe romper la operación, pero no puede
    // quedar silencioso: es un hueco de trazabilidad.
    log("error", "insertAuditLog falló", {
      action,
      entity,
      organization_id: organizationId,
      error: error.message,
    });
  }
}
