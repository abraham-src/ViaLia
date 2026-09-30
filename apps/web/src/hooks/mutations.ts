import type {
  CreateIncidentInput,
  DeviceDto,
  DeviceStatus,
  IncidentDto,
  IncidentEventDto,
  IncidentPriority,
  ListResponse,
} from '@simu/shared-types';
import type { IncidentAction } from '@simu/shared-utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { qk } from './queries';

export interface Assignee {
  id: string;
  name: string;
}

export function useAssignees(enabled: boolean) {
  return useQuery({
    queryKey: ['assignees'],
    queryFn: ({ signal }) =>
      api.get<ListResponse<Assignee>>('/users/assignees', signal).then((r) => r.data),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useIncident(id: string | null) {
  return useQuery({
    queryKey: ['incidents', 'one', id],
    queryFn: ({ signal }) => api.get<IncidentDto>(`/incidents/${id}`, signal),
    enabled: !!id,
  });
}

export function useIncidentEvents(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['incidents', 'events', id],
    queryFn: ({ signal }) =>
      api
        .get<ListResponse<IncidentEventDto>>(`/incidents/${id}/events`, signal)
        .then((r) => r.data),
    enabled: !!id && enabled,
  });
}

export interface ActionInput {
  id: string;
  action: IncidentAction;
  note?: string;
  assigneeId?: string;
}

/** Workflow action → endpoint. `start` and `reject` go through PATCH (status). */
function runAction({ id, action, note, assigneeId }: ActionInput): Promise<IncidentDto> {
  const n = note?.trim() ? { note: note.trim() } : {};
  switch (action) {
    case 'validate':
      return api.post(`/incidents/${id}/validate`, n);
    case 'resolve':
      return api.post(`/incidents/${id}/resolve`, n);
    case 'assign':
      return api.post(`/incidents/${id}/assign`, { user_id: assigneeId, ...n });
    case 'start':
      return api.patch(`/incidents/${id}`, { status: 'in_progress', ...n });
    case 'reject':
      return api.patch(`/incidents/${id}`, { status: 'rejected', ...n });
  }
}

export function useIncidentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runAction,
    onSettled: () => qc.invalidateQueries({ queryKey: qk.incidentsAll }),
  });
}

export function useSetPriority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: IncidentPriority }) =>
      api.patch<IncidentDto>(`/incidents/${id}`, { priority }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.incidentsAll }),
  });
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIncidentInput) => api.post<IncidentDto>('/incidents', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.incidentsAll }),
  });
}

export function useSetDeviceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      code,
      status,
      reason,
    }: {
      code: string;
      status: DeviceStatus;
      reason?: string;
    }) =>
      api.patch<DeviceDto>(`/devices/${code}/status`, { status, ...(reason ? { reason } : {}) }),
    onSuccess: (device) =>
      qc.setQueryData<DeviceDto[]>(qk.devices, (list) =>
        list?.map((d) => (d.device_code === device.device_code ? device : d)),
      ),
  });
}
