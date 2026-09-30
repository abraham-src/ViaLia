import type {
  AuditLogEntryDto,
  DeviceEventDto,
  IncidentDto,
  ListResponse,
  PaginatedResponse,
  RoleName,
  RuleDto,
  UserAdminDto,
  UserStatus,
} from '@simu/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs, request } from '../lib/api';
import { qk } from './queries';

// ── Rules ──
export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    queryFn: ({ signal }) => api.get<ListResponse<RuleDto>>('/rules', signal).then((r) => r.data),
  });
}

export type RuleInput = Pick<
  RuleDto,
  'name' | 'description' | 'enabled' | 'sort_order' | 'conditions' | 'action'
>;

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Partial<RuleInput> }) =>
      id ? api.patch<RuleDto>(`/rules/${id}`, input) : api.post<RuleDto>('/rules', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

// ── Users ──
export function useUsers(filter: { q?: string; role?: string; status?: string }) {
  return useQuery<UserAdminDto[]>({
    queryKey: ['users', filter],
    queryFn: ({ signal }) =>
      api.get<ListResponse<UserAdminDto>>(`/users${qs(filter)}`, signal).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

export interface UserCreateInput {
  name: string;
  email: string;
  password: string;
  role: RoleName;
}
export interface UserPatchInput {
  name?: string;
  role?: RoleName;
  status?: UserStatus;
  password?: string;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserCreateInput) => api.post<UserAdminDto>('/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UserPatchInput }) =>
      api.patch<UserAdminDto>(`/users/${id}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['assignees'] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// ── Maintenance ──
export function useAcceptIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<IncidentDto>(`/incidents/${id}/accept`),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.incidentsAll }),
  });
}

// ── Logs ──
export interface LogQuery {
  from?: string;
  to?: string;
  device_id?: string;
  type?: string;
  event_type?: string;
  page: number;
  page_size: number;
}

export function useDeviceEvents(q: LogQuery, enabled: boolean) {
  return useQuery<PaginatedResponse<DeviceEventDto>>({
    queryKey: ['logs', 'device', q],
    queryFn: ({ signal }) =>
      api.get<PaginatedResponse<DeviceEventDto>>(`/events${qs({ ...q })}`, signal),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

export function useAuditLog(q: LogQuery, enabled: boolean) {
  return useQuery<PaginatedResponse<AuditLogEntryDto>>({
    // Under 'incidents' so live incident changes refresh the audit log too.
    queryKey: ['incidents', 'audit', q],
    queryFn: ({ signal }) =>
      api.get<PaginatedResponse<AuditLogEntryDto>>(`/incident-events${qs({ ...q })}`, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}
