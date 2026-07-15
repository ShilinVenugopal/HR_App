import { ModuleName, PrismaClient, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
  const projectSeed = [
    { projectName: 'RIL Jamnagar', clientName: 'Reliance Industries Ltd', location: 'Jamnagar, Gujarat' },
    { projectName: 'IOCL Panipat', clientName: 'Indian Oil Corporation Ltd', location: 'Panipat, Haryana' },
    { projectName: 'OPaL', clientName: 'ONGC Petro additions Ltd', location: 'Dahej, Gujarat' },
    { projectName: 'HPCL', clientName: 'Hindustan Petroleum Corporation Ltd', location: 'Visakhapatnam, AP' },
    { projectName: 'Dangote', clientName: 'Dangote Group', location: 'Lagos, Nigeria' },
    { projectName: 'Nayara', clientName: 'Nayara Energy', location: 'Vadinar, Gujarat' },
  ];

  const projectIdByName = new Map<string, string>();
  for (const p of projectSeed) {
    const existing = await prisma.project.findFirst({ where: { projectName: p.projectName } });
    const project = existing
      ? await prisma.project.update({ where: { id: existing.id }, data: p })
      : await prisma.project.create({ data: p });
    projectIdByName.set(p.projectName, project.id);
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
      RECRUITMENT: { view: true, add: true, edit: true },
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
      EMPLOYEES: { view: true },
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

  console.log('Seed complete.');
  console.log(`Super Admin login: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
  console.log('Other seeded users share the same password (see .env SUPER_ADMIN_PASSWORD):');
  console.log('  site.admin@foraysgroup.com (Site Administrator)');
  console.log('  hr.executive@foraysgroup.com (HR Executive)');
  console.log('  project.manager@foraysgroup.com (Project Manager)');
  console.log('  finance@foraysgroup.com (Finance)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
