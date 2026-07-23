import { apiClient } from './client';
import { ApiListResponse, ApiSingleResponse } from '../types';

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: string | number | undefined;
}

/// Generic CRUD client factory — every module's REST surface follows the
/// same list/get/create/update/remove shape, so routes are generated once
/// instead of hand-rolled per module.
export function createResourceApi<T>(basePath: string) {
  return {
    list: async (params?: ListParams): Promise<ApiListResponse<T>> => {
      const { data } = await apiClient.get(basePath, { params });
      return data;
    },
    get: async (id: string): Promise<ApiSingleResponse<T>> => {
      const { data } = await apiClient.get(`${basePath}/${id}`);
      return data;
    },
    create: async (payload: Partial<T>): Promise<ApiSingleResponse<T>> => {
      const { data } = await apiClient.post(basePath, payload);
      return data;
    },
    update: async (id: string, payload: Partial<T>): Promise<ApiSingleResponse<T>> => {
      const { data } = await apiClient.put(`${basePath}/${id}`, payload);
      return data;
    },
    remove: async (id: string): Promise<void> => {
      await apiClient.delete(`${basePath}/${id}`);
    },
    patch: async (id: string, action: string, payload?: unknown): Promise<ApiSingleResponse<T>> => {
      const { data } = await apiClient.patch(`${basePath}/${id}/${action}`, payload);
      return data;
    },
    postAction: async <R = T>(id: string, action: string, payload?: unknown): Promise<ApiSingleResponse<R>> => {
      const { data } = await apiClient.post(`${basePath}/${id}/${action}`, payload);
      return data;
    },
  };
}
