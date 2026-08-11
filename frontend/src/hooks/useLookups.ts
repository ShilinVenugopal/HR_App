import { useQuery } from '@tanstack/react-query';
import { costCodesApi, departmentsApi, designationsApi, employeesApi, projectsApi, projectUnitsApi, vendorsApi } from '../api/modules';

export function useProjectOptions() {
  const { data } = useQuery({
    queryKey: ['lookup-projects'],
    queryFn: () => projectsApi.list({ pageSize: 100 }),
  });
  // projectNumber is carried alongside value/label (not just id+name) so
  // forms that need to auto-populate a project's number — e.g. Purchase
  // Requisition — can look it up by the selected project's id without a
  // second fetch. Existing consumers that only use value/label are
  // unaffected by this extra field.
  return (data?.data ?? []).map((p) => ({ value: p.id, label: p.projectName, projectNumber: p.projectNumber ?? null }));
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

/// Raw active-vendor rows (not just {value,label}) — used both to build
/// searchable-select options (name + product in one search box) and to
/// look up a selected vendor's full details for PO auto-fill.
export function useVendors() {
  const { data } = useQuery({
    queryKey: ['lookup-vendors'],
    queryFn: () => vendorsApi.list({ pageSize: 500 }),
  });
  return (data?.data ?? []).filter((v) => v.active);
}

export function useVendorOptions() {
  return useVendors().map((v) => ({
    value: v.id,
    label: v.name,
    searchText: v.productName ? `${v.name} ${v.productName}` : v.name,
  }));
}

/// Active Units for one Project — Unit is Project-specific, so this only
/// fetches (and only returns options) once a Project is actually known,
/// e.g. from the Employee selected in Mark Attendance. Deactivated Units
/// disappear from here immediately but existing attendance rows keep
/// showing whichever Unit they already reference (they store unitId, not
/// this list) — same rule as Cost Code's active-only lookup.
export function useProjectUnitOptions(projectId?: string) {
  const { data } = useQuery({
    queryKey: ['lookup-project-units', projectId],
    queryFn: () => projectUnitsApi.listByProject(projectId!, 'ACTIVE'),
    enabled: Boolean(projectId),
  });
  return (data ?? []).map((u) => ({ value: u.id, label: u.name }));
}

export function useEmployeeOptions(projectId?: string) {
  const { data } = useQuery({
    queryKey: ['lookup-employees', projectId],
    queryFn: () => employeesApi.list({ pageSize: 200, projectId }),
  });
  return (data?.data ?? []).map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})`, projectId: e.projectId }));
}
