import { prisma } from '../../config/database';
import { NAYARA_TEMPLATE } from './nayaraTemplate';
import { WageTemplateConfig } from './wageColumns.types';

/// Every built-in project wage template, keyed by its config's `code`.
/// `WageProjectTemplate.columns` is a DB-stored JSON snapshot of these
/// configs (see schema.prisma comment above the model) — editing a
/// template's column layout in code (e.g. nayaraTemplate.ts) does nothing
/// to an already-provisioned database until this snapshot is refreshed.
/// Previously that only happened via `prisma/seed.ts`, which is easy to
/// forget to re-run after a code-only column reorder — exactly the bug
/// this function exists to prevent by re-syncing on every server start.
const BUILT_IN_TEMPLATES: WageTemplateConfig[] = [NAYARA_TEMPLATE];

export async function syncBuiltInWageTemplates(): Promise<void> {
  for (const tpl of BUILT_IN_TEMPLATES) {
    const project = await prisma.project.findFirst({ where: { projectName: tpl.name } });
    if (!project) continue;
    await prisma.wageProjectTemplate.upsert({
      where: { code: tpl.code },
      update: { name: tpl.name, columns: tpl.columns as object, projectId: project.id, active: true },
      create: { code: tpl.code, name: tpl.name, columns: tpl.columns as object, projectId: project.id },
    });
  }
}
