import { getAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken } from "@/lib/invites";

export type OAuthNewUserReason = "no-account" | "invite-invalid";

export interface OAuthNewUserDecision {
  allow: boolean;
  reason?: OAuthNewUserReason;
}

/**
 * Decide si un usuario de Google sin organización puede continuar.
 * Solo se permite cuando el flujo proviene de un link de invitación
 * válido (next = /invitacion/{token} — o /invite/{token} en links viejos —
 * con token pendiente y vigente).
 */
export async function resolveOAuthNewUser(
  safeNext: string
): Promise<OAuthNewUserDecision> {
  const inviteMatch = safeNext.match(/^\/invit(?:e|acion)\/([^/?#]+)/);
  if (!inviteMatch) {
    return { allow: false, reason: "no-account" };
  }

  const adminClient = getAdminClient();
  const { data: invite } = await adminClient
    .from("invitations")
    .select("status, expires_at")
    .eq("token", await hashInviteToken(inviteMatch[1]))
    .maybeSingle();

  const valid =
    !!invite &&
    invite.status === "pending" &&
    new Date(invite.expires_at) > new Date();

  return valid
    ? { allow: true }
    : { allow: false, reason: "invite-invalid" };
}

/**
 * Actualiza nombre/avatar del perfil con datos del proveedor OAuth.
 * No crea organizaciones ni usuarios: solo enriquece perfiles que ya
 * pertenecen a una organización.
 */
export async function updateOAuthProfile(
  userId: string,
  fullName?: string,
  avatarUrl?: string | null
) {
  const adminClient = getAdminClient();

  const { data: profile } = await adminClient
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return { error: "Perfil no encontrado" };
  }

  const updates: Record<string, string> = {};
  if (fullName && profile.full_name !== fullName) {
    updates.full_name = fullName;
  }
  if (avatarUrl && profile.avatar_url !== avatarUrl) {
    updates.avatar_url = avatarUrl;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await adminClient
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (error) {
      return { error: "Error actualizando perfil: " + error.message };
    }
  }

  return { success: true };
}