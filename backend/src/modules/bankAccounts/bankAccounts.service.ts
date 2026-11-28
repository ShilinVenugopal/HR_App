import { BankAccountStatus, BankAccountType, Prisma } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/apiError';
import { recordAuditLog } from '../auditLogs/auditLog.service';
import { RequestMeta } from '../../utils/requestMeta';

const auditFieldsInclude = {
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.BankAccountInclude;

export async function listBankAccounts(status?: BankAccountStatus) {
  return prisma.bankAccount.findMany({
    where: status ? { status } : {},
    include: auditFieldsInclude,
    orderBy: { bankName: 'asc' },
  });
}

/// Cross-module reference data — any authenticated user reaches this
/// (no BANK_ACCOUNTS permission required), same convention as Vendor's
/// options endpoint: the Billing/Subcontractor Payments/Advances/Wages/
/// Site Accounts forms need the dropdown regardless of whether the user
/// also holds BANK_ACCOUNTS access.
export async function listBankAccountOptions() {
  return prisma.bankAccount.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, bankName: true, accountType: true, accountNumber: true },
    orderBy: { bankName: 'asc' },
  });
}

export async function getBankAccount(id: string) {
  const account = await prisma.bankAccount.findUnique({ where: { id }, include: auditFieldsInclude });
  if (!account) throw ApiError.notFound('Bank account not found');
  return account;
}

export interface BankAccountInput {
  bankName: string;
  accountHolderName: string;
  accountType: BankAccountType;
  accountNumber: string;
  branchName?: string;
  ifscCode?: string;
  openingBalance?: number;
  openingBalanceDate: Date;
  status?: BankAccountStatus;
}

export async function createBankAccount(req: Request, input: BankAccountInput, meta?: RequestMeta) {
  const duplicate = await prisma.bankAccount.findUnique({ where: { accountNumber: input.accountNumber } });
  if (duplicate) throw ApiError.conflict('A bank account with this Account Number is already registered');

  const account = await prisma.bankAccount.create({
    data: {
      bankName: input.bankName,
      accountHolderName: input.accountHolderName,
      accountType: input.accountType,
      accountNumber: input.accountNumber,
      branchName: input.branchName || null,
      ifscCode: input.ifscCode || null,
      openingBalance: input.openingBalance ?? 0,
      openingBalanceDate: input.openingBalanceDate,
      status: input.status ?? 'ACTIVE',
      createdById: req.user!.sub,
    },
    include: auditFieldsInclude,
  });

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'CREATE',
    module: 'BANK_ACCOUNTS',
    status: 'SUCCESS',
    meta,
    details: { bankAccountId: account.id, bankName: account.bankName, accountNumber: account.accountNumber, openingBalance: Number(account.openingBalance) },
  });

  return account;
}

export async function updateBankAccount(req: Request, id: string, input: Partial<BankAccountInput>, meta?: RequestMeta) {
  const existing = await getBankAccount(id);

  if (input.accountNumber && input.accountNumber !== existing.accountNumber) {
    const duplicate = await prisma.bankAccount.findUnique({ where: { accountNumber: input.accountNumber } });
    if (duplicate) throw ApiError.conflict('A bank account with this Account Number is already registered');
  }

  const openingBalanceChanged = input.openingBalance !== undefined && Number(input.openingBalance) !== Number(existing.openingBalance);

  const account = await prisma.bankAccount.update({
    where: { id },
    data: {
      bankName: input.bankName,
      accountHolderName: input.accountHolderName,
      accountType: input.accountType,
      accountNumber: input.accountNumber,
      branchName: input.branchName !== undefined ? input.branchName || null : undefined,
      ifscCode: input.ifscCode !== undefined ? input.ifscCode || null : undefined,
      openingBalance: input.openingBalance,
      openingBalanceDate: input.openingBalanceDate,
      status: input.status,
      updatedById: req.user!.sub,
    },
    include: auditFieldsInclude,
  });

  // Opening balance changes get their own explicit audit entry (req. 2B:
  // "Any changes to opening balances should be recorded in the audit
  // history") in addition to the general UPDATE entry below.
  if (openingBalanceChanged) {
    await recordAuditLog({
      userId: req.user!.sub,
      action: 'UPDATE',
      module: 'BANK_ACCOUNTS',
      status: 'SUCCESS',
      meta,
      details: {
        bankAccountId: id,
        openingBalanceChanged: true,
        previousOpeningBalance: Number(existing.openingBalance),
        newOpeningBalance: Number(account.openingBalance),
      },
    });
  }

  await recordAuditLog({
    userId: req.user!.sub,
    action: 'UPDATE',
    module: 'BANK_ACCOUNTS',
    status: 'SUCCESS',
    meta,
    details: { bankAccountId: id, changes: input },
  });

  return account;
}
