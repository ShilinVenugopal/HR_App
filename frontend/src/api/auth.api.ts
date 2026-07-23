import { apiClient } from './client';
import { AuthSession } from '../types';

export async function login(email: string, password: string): Promise<AuthSession> {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data.data;
}

export async function logout(refreshToken?: string): Promise<void> {
  await apiClient.post('/auth/logout', { refreshToken });
}

export async function changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
  const { data } = await apiClient.post('/auth/change-password', { currentPassword, newPassword, confirmPassword });
  return data;
}
