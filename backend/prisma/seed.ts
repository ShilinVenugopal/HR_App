import { ModuleName, PrismaClient, Role, UserStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { syncBuiltInWageTemplates } from '../src/modules/projectWages/templateSync';
import { seedCostCodeMasterData } from '../src/modules/costCodes/costCodeMasterSeed';
import { seedDefaultPoTerms, backfillPurchaseOrderTermsSnapshot } from '../src/modules/poTerms/poTermsSeed';
import { seedDemoProjectUnits } from '../src/modules/projectUnits/projectUnitsSeed';
import { seedTicketCategories, seedSampleTickets } from '../src/modules/tickets/ticketsSeed';

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
    { projectName: 'RIL Jamnagar', clientName: 'Reliance Industries Ltd', location: 'Jamnagar, Gujarat', projectNumber: 'PRJ-001' },
    { projectName: 'IOCL Panipat', clientName: 'Indian Oil Corporation Ltd', location: 'Panipat, Haryana', projectNumber: 'PRJ-002' },
    { projectName: 'OPaL', clientName: 'ONGC Petro additions Ltd', location: 'Dahej, Gujarat', projectNumber: 'PRJ-003' },
    { projectName: 'HPCL', clientName: 'Hindustan Petroleum Corporation Ltd', location: 'Visakhapatnam, AP', projectNumber: 'PRJ-004' },
    { projectName: 'Dangote', clientName: 'Dangote Group', location: 'Lagos, Nigeria', projectNumber: 'PRJ-005' },
    { projectName: 'Nayara AMC', clientName: 'Nayara Energy', location: 'Vadinar, Gujarat', projectNumber: 'PRJ-006' },
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
  await syncBuiltInWageTemplates();

  // ── Departments & Designations ─────────────────────────────────────
  const departments = ['Human Resources', 'Operations', 'Finance & Accounts', 'Safety (HSE)', 'Administration', 'Engineering'];
  for (const name of departments) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  }

  const designations = ['Site Supervisor', 'HR Officer', 'Safety Officer', 'Technician', 'Helper', 'Engineer', 'Project Manager', 'Accountant'];
  for (const name of designations) {
    await prisma.designation.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ── Cost Codes (Procurement) ────────────────────────────────────────
  // The 8 fixed categories from the client's real PUR-01.xlsx purchase
  // requisition template (sections A-H). PR items reference these; the
  // printed PR groups items by category via this same relation.
  const costCodes = [
    { code: 'F05A', name: 'Tools Tackles/Power Tools' },
    { code: 'F05D', name: 'Machineries (Fixed Assets)' },
    { code: 'F07A', name: 'Consumable' },
    { code: 'F08', name: 'Safety Items' },
    { code: 'F09', name: 'Construction Power' },
    { code: 'F10', name: 'Site Facilities' },
    { code: 'F11', name: 'PC, Printer Etc' },
    { code: 'F12', name: 'GH Items' },
  ];
  for (const cc of costCodes) {
    await prisma.costCode.upsert({ where: { code: cc.code }, update: { name: cc.name }, create: cc });
  }

  // ── Cost Code Master (full reference import) ─────────────────────────
  // The broader F01-F24 Cost Code Summary — create-only, never overwrites
  // the 8 PUR-01-specific codes above or any future Super Admin edit.
  await seedCostCodeMasterData();

  // ── Purchase Order Terms & Conditions template ────────────────────────
  // Create-only default template, then freeze every pre-existing PO at
  // exactly what it already displays before the template becomes
  // Super-Admin-editable. Order matters: the backfill reads whatever is
  // currently in the table, so it must run after the seed.
  await seedDefaultPoTerms();
  await backfillPurchaseOrderTermsSnapshot();

  // ── Attendance Units (per-project demo data) ──────────────────────────
  await seedDemoProjectUnits();

  // ── Ticket Categories (configurable master data) ─────────────────────
  await seedTicketCategories(prisma);

  // ── Vendors (Procurement) ────────────────────────────────────────────
  const vendors = [
    { name: 'Bosch Power Tools India Pvt Ltd', address: 'Adugodi, Bengaluru, Karnataka, India', gstNumber: '29AABCB1234M1Z5', email: 'sales@boschtools.example', phone: '+919876500001', contactPerson: 'Rajesh Kumar' },
    { name: 'Ashirvad Safety Equipments', address: 'Industrial Area, Vadodara, Gujarat, India', gstNumber: '24AABCA5678N1Z2', email: 'orders@ashirvadsafety.example', phone: '+919876500002', contactPerson: 'Priya Shah' },
  ];
  for (const v of vendors) {
    const existing = await prisma.vendor.findFirst({ where: { name: v.name } });
    if (existing) await prisma.vendor.update({ where: { id: existing.id }, data: v });
    else await prisma.vendor.create({ data: v });
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
  const siteAdminUser = await upsertUser({
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
      BILLING_STATUS: { view: true, add: true, edit: true },
      // Site team: drafts and saves statements, but cannot re-open a
      // Saved statement — that "correction" right (canApprove) is reserved
      // for the office-side users below.
      SITE_ACCOUNTS: { view: true, add: true, edit: true },
      // Site team enters/updates the monthly expense sheet; delete is
      // reserved for Finance below, same office-oversight split as
      // BILLING_STATUS/SITE_ACCOUNTS.
      EXPENSE: { view: true, add: true, edit: true },
      // Site Admin can raise/act on their own tickets and also see every
      // user's tickets org-wide (canApprove doubles as the "All Tickets"
      // elevated-visibility flag, same pattern as SITE_ACCOUNTS above).
      TICKETS: { view: true, add: true, edit: true, approve: true },
    }),
    projectIdByName,
  });

  // ── HR Executive ─────────────────────────────────────────────────────
  const hrExecutiveUser = await upsertUser({
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
      // HR is a common ticket destination in the example scenarios, and
      // Human Resources naturally has org-wide helpdesk visibility.
      TICKETS: { view: true, add: true, edit: true, approve: true },
    }),
    projectIdByName,
  });

  // ── Project Manager ──────────────────────────────────────────────────
  const projectManagerUser = await upsertUser({
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
      EXPENSE: { view: true },
      // Base helpdesk access only — raises/works tickets assigned to them,
      // no "All Tickets" visibility (matches the requirement that most
      // roles must not automatically see every user's tickets).
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  // ── Finance ──────────────────────────────────────────────────────────
  await upsertUser({
    name: 'Finance Executive - OPaL',
    email: 'finance@foraysgroup.com',
    mobile: '+919999999904',
    role: Role.FINANCE,
    // Also assigned RIL Jamnagar (alongside Site Administrator) so the
    // Site Accounts DRAFT (site team) -> SAVED -> correction (office team,
    // canApprove) workflow can actually be exercised end to end on the
    // same project in this demo dataset.
    projectNames: ['OPaL', 'RIL Jamnagar'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      WAGES: { view: true, add: true, edit: true, approve: true },
      ADVANCES: { view: true, add: true, edit: true, approve: true },
      REPORTS: { view: true },
      BILLING_STATUS: { view: true, add: true, edit: true, delete: true },
      // Office team: views every statement and holds the "correction"
      // right (canApprove) to re-open a Saved statement.
      SITE_ACCOUNTS: { view: true, approve: true },
      // Office/finance oversight: full CRUD, unlike the site team's
      // view+add+edit-only grant above.
      EXPENSE: { view: true, add: true, edit: true, delete: true },
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  // ── Normal User (view-only) ───────────────────────────────────────────
  const normalUser = await upsertUser({
    name: 'Normal User - RIL Jamnagar',
    email: 'normal.user@foraysgroup.com',
    mobile: '+919999999905',
    role: Role.NORMAL_USER,
    projectNames: ['RIL Jamnagar'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      EMPLOYEES: { view: true },
      // Every authorized user can raise a ticket — this is the baseline
      // grant, deliberately without canApprove, so "All Tickets" stays
      // hidden for a normal user by default.
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  // ── Procurement roles ──────────────────────────────────────────────
  // Modules/pages for these don't exist yet (built out phase-by-phase in
  // later work) — seeding the accounts + permission rows now means the
  // Permission Matrix Editor already shows the new modules, and each
  // account is ready to use the instant its module ships.

  const procurementAdminUser = await upsertUser({
    name: 'Procurement Admin - Multi-Site',
    email: 'procurement.admin@foraysgroup.com',
    mobile: '+919999999906',
    role: Role.PROCUREMENT_ADMIN,
    projectNames: ['RIL Jamnagar', 'IOCL Panipat', 'Nayara AMC'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      PROCUREMENT_DASHBOARD: { view: true },
      INVENTORY: { view: true, add: true, edit: true, delete: true, approve: true },
      PURCHASE_REQUISITION: { view: true, add: true, edit: true, delete: true, approve: true },
      PURCHASE_ORDER: { view: true, add: true, edit: true, delete: true, approve: true },
      GRN: { view: true, add: true, edit: true, delete: true, approve: true },
      REPORTS: { view: true },
      SETTINGS: { view: true, add: true, edit: true },
      // Stands in for "IT Admin" in the example ticket scenarios — an
      // org-wide helpdesk admin.
      TICKETS: { view: true, add: true, edit: true, approve: true },
    }),
    projectIdByName,
  });

  await upsertUser({
    name: 'Project Engineer - RIL Jamnagar',
    email: 'project.engineer@foraysgroup.com',
    mobile: '+919999999907',
    role: Role.PROJECT_ENGINEER,
    projectNames: ['RIL Jamnagar'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      INVENTORY: { view: true },
      PURCHASE_REQUISITION: { view: true, add: true, edit: true },
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  await upsertUser({
    name: 'Store Incharge - IOCL Panipat',
    email: 'store.incharge@foraysgroup.com',
    mobile: '+919999999908',
    role: Role.STORE_INCHARGE,
    projectNames: ['IOCL Panipat'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      INVENTORY: { view: true, add: true, edit: true },
      PURCHASE_ORDER: { view: true },
      GRN: { view: true, add: true, edit: true },
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  await upsertUser({
    name: 'Purchase Team - OPaL',
    email: 'purchase.team@foraysgroup.com',
    mobile: '+919999999909',
    role: Role.PURCHASE_TEAM,
    projectNames: ['OPaL'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      INVENTORY: { view: true },
      PURCHASE_REQUISITION: { view: true },
      PURCHASE_ORDER: { view: true, add: true, edit: true },
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  await upsertUser({
    name: 'Accounts - HPCL',
    email: 'accounts@foraysgroup.com',
    mobile: '+919999999910',
    role: Role.ACCOUNTS,
    projectNames: ['HPCL'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      PURCHASE_ORDER: { view: true },
      GRN: { view: true },
      REPORTS: { view: true },
      BILLING_STATUS: { view: true, add: true, edit: true },
      SITE_ACCOUNTS: { view: true, approve: true },
      EXPENSE: { view: true, add: true, edit: true },
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  await upsertUser({
    name: 'Site User - Dangote',
    email: 'site.user@foraysgroup.com',
    mobile: '+919999999911',
    role: Role.SITE_USER,
    projectNames: ['Dangote'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      INVENTORY: { view: true },
      PURCHASE_REQUISITION: { view: true },
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  await upsertUser({
    name: 'Approver - Nayara AMC',
    email: 'approver@foraysgroup.com',
    mobile: '+919999999912',
    role: Role.APPROVER,
    projectNames: ['Nayara AMC'],
    permissions: permissionsFor({
      DASHBOARD: { view: true },
      PROCUREMENT_DASHBOARD: { view: true },
      PURCHASE_REQUISITION: { view: true, approve: true },
      PURCHASE_ORDER: { view: true, approve: true },
      GRN: { view: true, approve: true },
      TICKETS: { view: true, add: true },
    }),
    projectIdByName,
  });

  // ── Sample Tickets (idempotent — skipped once any ticket exists) ─────
  await seedSampleTickets(prisma, {
    raiser: superAdmin.id,
    hr: hrExecutiveUser.id,
    it: procurementAdminUser.id,
    pm: projectManagerUser.id,
    normal: normalUser.id,
  });

  console.log('Seed complete.');
  console.log(`Super Admin login: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
  console.log('Other seeded users share the same password (see .env SUPER_ADMIN_PASSWORD):');
  console.log('  site.admin@foraysgroup.com (Site Administrator)');
  console.log('  hr.executive@foraysgroup.com (HR Executive)');
  console.log('  project.manager@foraysgroup.com (Project Manager)');
  console.log('  finance@foraysgroup.com (Finance)');
  console.log('  normal.user@foraysgroup.com (Normal User, view-only)');
  console.log('  procurement.admin@foraysgroup.com (Procurement Admin)');
  console.log('  project.engineer@foraysgroup.com (Project Engineer)');
  console.log('  store.incharge@foraysgroup.com (Store Incharge)');
  console.log('  purchase.team@foraysgroup.com (Purchase Team)');
  console.log('  accounts@foraysgroup.com (Accounts)');
  console.log('  site.user@foraysgroup.com (Site User)');
  console.log('  approver@foraysgroup.com (Approver)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
