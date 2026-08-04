import { useQuery } from '@tanstack/react-query';
import { costCodesApi, departmentsApi, designationsApi, employeesApi, projectsApi, vendorsApi } from '../api/modules';

export function useProjectOptions() {
  const { data } = useQuery({
    queryKey: ['lookup-projects'],
    queryFn: () => projectsApi.list({ pageSize: 100 }),
  });
  return (data?.data ?? []).map((p) => ({ value: p.id, label: p.projectName }));
}

export function useDesignationOptions() {
  const { data } = useQuery({
    queryKey: ['lookup-designations'],
    queryFn: () => designationsApi.list({ pageSize: 100 }),
  });
  return (data?.data ?? []).map((d) => ({ value: d.id, label: d.name }));
}

export function useDepartmentOptions() {
  const { data } = useQuery({
    queryKey: ['lookup-departments'],
    queryFn: () => departmentsApi.list({ pageSize: 100 }),
  });
  return (data?.data ?? []).map((d) => ({ value: d.id, label: d.name }));
}

/// Only ACTIVE cost codes are ever offered for new selections (Inventory,
/// PR/PO/GRN items etc.) — a code a Super Admin deactivates disappears
/// from here immediately, but existing records that already reference it
/// keep displaying it unchanged, since they store the costCodeId, not this
/// list.
export function useCostCodeOptions() {
  const { data } = useQuery({
    queryKey: ['lookup-cost-codes'],
    queryFn: () => costCodesApi.list({ pageSize: 300, status: 'ACTIVE' }),
  });
  return (data?.data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}`, code: c.code, name: c.name }));
}

export function useVendorOptions() {
  const { data } = useQuery({
    queryKey: ['lookup-vendors'],
    queryFn: () => vendorsApi.list({ pageSize: 200 }),
  });
  return (data?.data ?? []).filter((v) => v.active).map((v) => ({ value: v.id, label: v.name }));
}

export function useEmployeeOptions(projectId?: string) {
  const { data } = useQuery({
    queryKey: ['lookup-employees', projectId],
    queryFn: () => employeesApi.list({ pageSize: 200, projectId }),
  });
  return (data?.data ?? []).map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})`, projectId: e.projectId }));
}
