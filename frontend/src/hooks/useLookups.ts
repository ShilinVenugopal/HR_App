import { useQuery } from '@tanstack/react-query';
import { departmentsApi, designationsApi, employeesApi, projectsApi } from '../api/modules';

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

export function useEmployeeOptions(projectId?: string) {
  const { data } = useQuery({
    queryKey: ['lookup-employees', projectId],
    queryFn: () => employeesApi.list({ pageSize: 200, projectId }),
  });
  return (data?.data ?? []).map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})`, projectId: e.projectId }));
}
