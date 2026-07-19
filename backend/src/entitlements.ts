import type { PoolClient } from "pg";
import { db, query } from "./db.js";

export type EntitlementPlan = "free" | "standard" | "contributor";
export type EntitlementStatus = "active" | "expired" | "canceled";

export type UserEntitlement = {
  plan: EntitlementPlan;
  status: EntitlementStatus;
  validUntil: string | null;
  consentVersion: string | null;
  canUsePublicSubtitles: boolean;
  canContribute: boolean;
  generationVideoLimit: number | null;
  unlimitedGeneration: boolean;
};

type EntitlementRow = {
  plan: EntitlementPlan;
  status: EntitlementStatus;
  valid_until: Date | string | null;
  generation_video_limit: number | null;
  contribution_consent_version: string | null;
  contribution_consented_at: Date | string | null;
  contribution_withdrawn_at: Date | string | null;
};

function effectiveStatus(row: EntitlementRow): EntitlementStatus {
  if (row.status !== "active") return row.status;
  if (row.valid_until && new Date(row.valid_until).getTime() <= Date.now()) return "expired";
  return "active";
}

function normalize(row?: EntitlementRow): UserEntitlement {
  if (!row) {
    return {
      plan: "free",
      status: "active",
      validUntil: null,
      consentVersion: null,
      canUsePublicSubtitles: false,
      canContribute: false,
      generationVideoLimit: null,
      unlimitedGeneration: true
    };
  }
  const status = effectiveStatus(row);
  const paidActive = status === "active" && (row.plan === "standard" || row.plan === "contributor");
  const consentActive = row.plan === "contributor"
    && Boolean(row.contribution_consent_version && row.contribution_consented_at)
    && !row.contribution_withdrawn_at;
  return {
    plan: row.plan,
    status,
    validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : null,
    consentVersion: row.contribution_consent_version,
    canUsePublicSubtitles: paidActive,
    canContribute: paidActive && consentActive,
    generationVideoLimit: row.generation_video_limit,
    unlimitedGeneration: row.generation_video_limit === null
  };
}

export async function getUserEntitlement(userId: string, client?: PoolClient) {
  const sql = `select plan, status, valid_until, generation_video_limit, contribution_consent_version,
    contribution_consented_at, contribution_withdrawn_at
    from user_entitlements where user_id = $1`;
  const result = client
    ? await client.query<EntitlementRow>(sql, [userId])
    : await query<EntitlementRow>(sql, [userId]);
  return normalize(result.rows[0]);
}

export async function getGenerationUsage(userId: string) {
  const result = await query<{ used: string }>(
    `select count(*)::text as used from user_video_usage
     where user_id = $1 and status in ('reserved', 'completed')`,
    [userId]
  );
  return Number(result.rows[0]?.used || 0);
}

/** Billing/webhook integration point. Payment providers should call this instead of writing tables directly. */
export async function setUserEntitlement(input: {
  userId: string;
  plan: EntitlementPlan;
  status: EntitlementStatus;
  validUntil?: Date | null;
  consentVersion?: string | null;
  consentGranted?: boolean;
}) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const consentGranted = input.plan === "contributor" && input.status === "active" && input.consentGranted === true;
    await client.query(
      `insert into user_entitlements (
         user_id, plan, status, valid_until, contribution_consent_version,
         contribution_consented_at, contribution_withdrawn_at
       ) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id) do update set plan = excluded.plan, status = excluded.status,
         valid_until = excluded.valid_until,
         contribution_consent_version = excluded.contribution_consent_version,
         contribution_consented_at = excluded.contribution_consented_at,
         contribution_withdrawn_at = excluded.contribution_withdrawn_at,
         updated_at = now()`,
      [
        input.userId,
        input.plan,
        input.status,
        input.validUntil ?? null,
        consentGranted ? input.consentVersion || "v1" : null,
        consentGranted ? new Date() : null,
        consentGranted ? null : new Date()
      ]
    );
    if (!consentGranted) {
      await client.query(
        `delete from translated_subtitles
         where created_by_user_id = $1 and publication_status = 'candidate'`,
        [input.userId]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
