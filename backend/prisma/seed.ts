import { ModuleName, PrismaClient, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { NAYARA_TEMPLATE } from '../src/modules/projectWages/nayaraTemplate';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'admin@foraysgroup.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe@12345';
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

const ALL_MODULES = Object.values(ModuleName);

const FULL_PERMISSIONS = ALL_MODULES.map((module) => ({
  module,
  canView: true,
  canAdd: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
}));

function permissionsFor(config: Partial<Record<ModuleName, { view?: boolean; add?: boolean; edit?: boolean; delete?: boolean; approve?: boolean }>>) {
  return ALL_MODULES.map((module) => {
    const cfg = config[module] ?? {};
    return {
      module,
      canView: cfg.view ?? false,
      canAdd: cfg.add ?? false,
      canEdit: cfg.edit ?? false,
      canDelete: cfg.delete ?? false,
      canApprove: cfg.approve ?? false,
    };
  });
}

async function upsertUser(params: {
  name: string;
  email: string;
  mobile: string;
  role: Role;
  projectNames: string[];
  permissions: ReturnType<typeof permissionsFor>;
  projectIdByName: Map<string, string>;
}) {
  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, SALT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: {},
    create: {
      name: params.name,
      email: params.email,
      mobile: params.mobile,
      passwordHash,
      role: params.role,
      status: UserStatus.ACTIVE,
    },
  });

  const projectIds = params.projectNames.map((n) => params.projectIdByName.get(n)).filter((id): id is string => Boolean(id));

  await prisma.userProject.deleteMany({ where: { userId: user.id } });
  if (projectIds.length) {
    await prisma.userProject.createMany({ data: projectIds.map((projectId) => ({ userId: user.id, projectId })) });
  }

  await prisma.permission.deleteMany({ where: { userId: user.id } });
  await prisma.permission.createMany({ data: params.permissions.map((p) => ({ ...p, userId: user.id })) });

  return user;
}

async function main() {
  console.log('Seeding Forays Group HR Solutions database...');

  // ── Projects ────────────────────────────────────────────────────────
  // One-time rename: the project seeded as 'Nayara' before the project-wise
  // Wages module existed becomes 'Nayara AMC' (matching the client's AMC
  // wage-sheet template), instead of leaving an orphaned duplicate.
  const legacyNayara = await prisma.project.findFirst({ where: { projectName: 'Nayara' } });
  const nayaraAmcAlreadyExists = await prisma.project.findFirst({ where: { projectName: 'Nayara AMC' } });
  if (legacyNayara && !nayaraAmcAlreadyExists) {
    await prisma.project.update({ where: { id: legacyNayara.id }, data: { projectName: 'Nayara AMC' } });
  }

  const projectSeed = [
    { projectName: 'RIL Jamnagar', clientName: 'Reliance Industries Ltd', location: 'Jamnagar, Gujarat' },
    { projectName: 'IOCL Panipat', clientName: 'Indian Oil Corporation Ltd', location: 'Panipat, Haryana' },
    { projectName: 'OPaL', clientName: 'ONGC Petro additions Ltd', location: 'Dahej, Gujarat' },
    { projectName: 'HPCL', clientName: 'Hindustan Petroleum Corporation Ltd', location: 'Visakhapatnam, AP' },
    { projectName: 'Dangote', clientName: 'Dangote Group', location: 'Lagos, Nigeria' },
    { projectName: 'Nayara AMC', clientName: 'Nayara Energy', location: 'Vadinar, Gujarat' },
  ];

  const projectIdByName = new Map<string, string>();
  for (const p of projectSeed) {
    const existing = await prisma.project.findFirst({ where: { projectName: p.projectName } });
    const project = existing
      ? await prisma.project.update({ where: { id: existing.id }, data: p })
      : await prisma.project.create({ data: p });
    projectIdByName.set(p.projectName, project.id);
  }

  // ── Project-wise Wages templates ────────────────────────────────────
  const nayaraProjectId = projectIdByName.get('Nayara AMC');
  if (nayaraProjectId) {
    await prisma.wageProjectTemplate.upsert({
      where: { code: NAYARA_TEMPLATE.code },
      update: { name: NAYARA_TEMPLATE.name, columns: NAYARA_TEMPLATE.columns as object, projectId: nayaraProjectId, active: true },
      create: { code: NAYARA_TEMPLATE.code, name: NAYARA_TEMPLATE.name, columns: NAYARA_TEMPLATE.columns as object, projectId: nayaraProjectId },
    });
  }

  // ── Departments & Designations ─────────────────────────────────────
  const departments = ['Human Resources', 'Operations', 'Finance & Accounts', 'Safety (HSE)', 'Administration', 'Engineering'];
  for (const name of departments) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  }

  const designations = ['Site Supervisor', 'HR Officer', 'Safety Officer', 'Technician', 'Helper', 'Engineer', 'Project Manager', 'Accountant'];
  for (const name of designations) {
    await prisma.designation.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ── Super Administrator ────────────────────────────────────────────
  const superAdminPasswordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, SALT_ROUNDS);
  const superAdmin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {},
    create: {
      name: 'System Super Administrator',
      email: SUPER_ADMIN_EMAIL,
      mobile: '+919999999999',
      passwordHash: superAdminPasswordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  await prisma.permission.deleteMany({ where: { userId: superAdmin.id } });
  await prisma.permission.createMany({ data: FULL_PERMISSIONS.map((p) => ({ ...p, userId: superAdmin.id })) });
  // Super Admin implicitly has unrestricted access, but we still link every
  // project so "Assigned Projects" displays meaningfully in User Management.
  await prisma.userProject.deleteMany({ where: { userId: superAdmin.id } });
  await prisma.userProject.createMany({
    data: Array.from(projectIdByName.values()).map((projectId) => ({ userId: superAdmin.id, projectId })),
  });

  // ── Site Administrator (assigned RIL Jamnagar + IOCL Panipat only) ──
  await upsertUser({
    name: 'Site Administrator - West Zone',
    email: 'site.admin@foraysgroup.com',
    mobile: '+919999999901',
    role: Role.SITE_ADMIN,
    projectNames: ['RIL Jamnagar', 'IOCL Panipat'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      RECRUITMENT: { view: true, add: true, edit: true, delete: true },
      EMPLOYEES: { view: true, add: true, edit: true, delete: true },
      ATTENDANCE: { view: true, add: true, edit: true, approve: true },
      WAGES: { view: true, approve: true },
      COMPLIANCE: { view: true, add: true, edit: true },
      ADVANCES: { view: true, approve: true },
      REPORTS: { view: true },
      SETTINGS: { view: true, add: true, edit: true },
    }),
    projectIdByName,
  });

  // ── HR Executive ─────────────────────────────────────────────────────
  await upsertUser({
    name: 'HR Executive - RIL Jamnagar',
    email: 'hr.executive@foraysgroup.com',
    mobile: '+919999999902',
    role: Role.HR_EXECUTIVE,
    projectNames: ['RIL Jamnagar'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      // canApprove on RECRUITMENT doubles as "can send Bulk Communication"
      // (templates, Bulk Email/WhatsApp) — reuses the existing permission
      // matrix rather than a hardcoded role check.
      RECRUITMENT: { view: true, add: true, edit: true, approve: true },
      EMPLOYEES: { view: true, add: true, edit: true },
      ATTENDANCE: { view: true, add: true },
    }),
    projectIdByName,
  });

  // ── Project Manager ──────────────────────────────────────────────────
  await upsertUser({
    name: 'Project Manager - IOCL Panipat',
    email: 'project.manager@foraysgroup.com',
    mobile: '+919999999903',
    role: Role.PROJECT_MANAGER,
    projectNames: ['IOCL Panipat'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      // View/edit only — project scoping already limits this to the
      // Project Manager's own assigned project(s); no add/delete.
      EMPLOYEES: { view: true, edit: true },
      ATTENDANCE: { view: true, approve: true },
      REPORTS: { view: true },
      WAGES: { view: true },
    }),
    projectIdByName,
  });

  // ── Finance ──────────────────────────────────────────────────────────
  await upsertUser({
    name: 'Finance Executive - OPaL',
    email: 'finance@foraysgroup.com',
    mobile: '+919999999904',
    role: Role.FINANCE,
    projectNames: ['OPaL'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      WAGES: { view: true, add: true, edit: true, approve: true },
      ADVANCES: { view: true, add: true, edit: true, approve: true },
      REPORTS: { view: true },
    }),
    projectIdByName,
  });

  // ── Normal User (view-only) ───────────────────────────────────────────
  await upsertUser({
    name: 'Normal User - RIL Jamnagar',
    email: 'normal.user@foraysgroup.com',
    mobile: '+919999999905',
    role: Role.NORMAL_USER,
    projectNames: ['RIL Jamnagar'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      EMPLOYEES: { view: true },
    }),
    projectIdByName,
  });

  console.log('Seed complete.');
  console.log(`Super Admin login: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
  console.log('Other seeded users share the same password (see .env SUPER_ADMIN_PASSWORD):');
  console.log('  site.admin@foraysgroup.com (Site Administrator)');
  console.log('  hr.executive@foraysgroup.com (HR Executive)');
  console.log('  project.manager@foraysgroup.com (Project Manager)');
  console.log('  finance@foraysgroup.com (Finance)');
  console.log('  normal.user@foraysgroup.com (Normal User, view-only)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
