import { z } from "zod";

/**
 * Community form schemas (P3, issue #44) mirroring ADR-006 §3/§4/§7 limits:
 *   - title       1–255 (VARCHAR(255) NOT NULL)
 *   - summary     ≤ 500 (VARCHAR(500) NULL)
 *   - tags        ≤ 5 distinct labels matching `[a-z0-9][a-z0-9 -]{0,39}`
 *   - authorAlias 1–80 (VARCHAR(80); required at publish — §4/§7)
 *   - reason      1–500 (moderation hide/restore is mandatory — §4)
 *   - note        ≤ 500 optional (report dismiss/resolve — §7)
 *
 * `categoryId` is held as the raw `<select>` string (the `createExamSchema`
 * `purposeId` precedent) and converted to `number | undefined` on submit.
 */

/** §3 tag label grammar — callers lower-case + trim before validating. */
export const COMMUNITY_TAG_PATTERN = /^[a-z0-9][a-z0-9 -]{0,39}$/;

/** §3 `reuse_policy` — NO_FORK default; ALLOW_FORK only via the consent warning. */
export const REUSE_POLICIES = ["NO_FORK", "ALLOW_FORK"] as const;
export type CommunityReusePolicyValue = (typeof REUSE_POLICIES)[number];

export const communityTagSchema = z
  .string()
  .regex(
    COMMUNITY_TAG_PATTERN,
    "Tags use 1–40 lowercase letters, digits, spaces or hyphens."
  );

export const communityTagsSchema = z
  .array(communityTagSchema)
  .max(5, "Add at most 5 tags.");

export const communityTitleSchema = z
  .string()
  .min(1, "Title is required.")
  .max(255, "Title must be 255 characters or fewer.");

export const communitySummarySchema = z
  .string()
  .max(500, "Summary must be 500 characters or fewer.");

export const communityAuthorAliasSchema = z
  .string()
  .min(1, "A public credit alias is required to publish.")
  .max(80, "Alias must be 80 characters or fewer.");

export const moderationNoteSchema = z
  .string()
  .max(500, "Note must be 500 characters or fewer.");
export const moderationReasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");
/**
 * "Publish to Community" dialog — create + publish in one flow, so the public
 * credit alias is mandatory HERE (ADR §7: pre-filled from display name behind
 * an explicit "publicly visible" acknowledgment the user must accept).
 */
export const publishToCommunitySchema = z.object({
  title: communityTitleSchema,
  summary: communitySummarySchema.optional(),
  categoryId: z.string().optional(),
  tags: communityTagsSchema,
  authorAlias: communityAuthorAliasSchema,
  aliasAcknowledged: z.boolean().refine(
    (v) => v,
    "Acknowledge that this alias will be publicly visible to everyone."
  ),
  reusePolicy: z.enum(REUSE_POLICIES),
});

export type PublishToCommunityValues = z.infer<typeof publishToCommunitySchema>;

/**
 * Edit-details dialog — the §4 PATCHable set. Alias stays required: every
 * publication created through this UI carries one from the publish flow, and
 * publish is impossible without it (409 COMMUNITY_ALIAS_REQUIRED).
 */
export const editPublicationSchema = z.object({
  title: communityTitleSchema,
  summary: communitySummarySchema.optional(),
  categoryId: z.string().optional(),
  tags: communityTagsSchema,
  authorAlias: communityAuthorAliasSchema,
  reusePolicy: z.enum(REUSE_POLICIES),
});

export type EditPublicationValues = z.infer<typeof editPublicationSchema>;

/** Moderator hide/restore — reason is mandatory (§4). */
export const moderationReasonFormSchema = z.object({
  reason: moderationReasonSchema,
});
export type ModerationReasonValues = z.infer<typeof moderationReasonFormSchema>;

/** Moderator report dismiss/resolve — note is optional (§7). */
export const moderationNoteFormSchema = z.object({
  note: moderationNoteSchema.optional(),
});
export type ModerationNoteValues = z.infer<typeof moderationNoteFormSchema>;
