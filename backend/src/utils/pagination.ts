import { Request } from 'express';

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
}

const MAX_PAGE_SIZE = 100;

export function parsePagination(req: Request, defaultSortBy = 'createdAt'): PaginationParams {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || 20));
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : defaultSortBy;
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    search: search || undefined,
    sortBy,
    sortOrder,
  };
}
