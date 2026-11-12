// NOTE: no "server-only" guard — seed/jobs/tests import this module under
// plain Node. Client bundles still cannot import it (pg does not bundle).
import { db } from "../db";
import { settings } from "../db/schema";
import { eq } from "drizzle-orm";
import { SETTINGS_DEFAULTS, SETTINGS_DESCRIPTIONS, isEditableSetting, type PlatformSettings } from "@/lib/settings-defaults";

/**
 * Platform settings (spec §15): typed accessors backed by the settings
 * table. DB values win over defaults; the admin edits them from the panel
 * and every change is audited.
 */

export { SETTINGS_DEFAULTS, SETTINGS_DESCRIPTIONS, isEditableSetting };
export type { PlatformSettings };

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await db.select().from(settings);
  const result: PlatformSettings = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (row.key in result) {
      (result as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return result;
}

export async function getSetting(key: string): Promise<unknown> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  if (!isEditableSetting(key)) {
    throw new Error(`Setting "${key}" is not editable`);
  }
  await db
    .insert(settings)
    .values({
      key,
      value: value as never,
      description: SETTINGS_DESCRIPTIONS[key],
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never, updatedAt: new Date() },
    });
}
