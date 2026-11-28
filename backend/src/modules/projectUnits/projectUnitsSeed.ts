import { prisma } from '../../config/database';

/// Demo Units per seeded project, so the Manpower Summary feature has
/// something to show out of the box. Create-only *per project* — if a
/// project already has any Units (whether from a prior seed run or a
/// Super Admin's own edits), it's left completely alone.
const DEMO_UNITS: Record<string, string[]> = {
  'RIL Jamnagar': ['Unit A', 'Unit B', 'Unit C', 'Unit D'],
  'IOCL Panipat': ['Unit 1', 'Unit 2', 'Unit 3'],
};

export async function seedDemoProjectUnits(): Promise<void> {
  for (const [projectName, unitNames] of Object.entries(DEMO_UNITS)) {
    const project = await prisma.project.findFirst({ where: { projectName } });
    if (!project) continue;

    const existingCount = await prisma.projectUnit.count({ where: { projectId: project.id } });
    if (existingCount > 0) continue;

    await prisma.projectUnit.createMany({
      data: unitNames.map((name) => ({ projectId: project.id, name })),
    });
  }
}
