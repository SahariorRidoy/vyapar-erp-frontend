'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { usePartyGroups } from '@/hooks/data';
import { useResetOn } from '@/hooks/use-reset-on';
import { useCompany } from '@/providers/company';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';

export function GroupModal({ open, onOpenChange, group, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; group?: { _id: string; name: string; description?: string } | null; onSaved?: (g: { _id: string; name: string }) => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  useResetOn(open ? (group?._id ?? 'new') : null, () => {
    if (!open) return;
    setName(group?.name ?? '');
    setDescription(group?.description ?? '');
  });
  const save = useMutation({
    mutationFn: async () => (group ? await api.put<{ _id: string; name: string }>(`/parties/groups/${group._id}`, { name, description }) : await api.post<{ _id: string; name: string }>('/parties/groups', { name, description })).data,
    onSuccess: (g) => {
      invalidateCompany(qc, cid);
      toast.success(group ? 'Group updated' : `Group "${g.name}" created`);
      onSaved?.(g);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={group ? 'Edit party group' : 'Add party group'}
      description="Groups let you organise parties, e.g. Retailers, Distributors, North zone."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <Field label="Group name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wholesale customers" />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}

export function MoveGroupModal({ open, onOpenChange, partyIds, currentGroup, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; partyIds: string[]; currentGroup?: string | null; onDone?: () => void }) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const groups = usePartyGroups(open);
  const [group, setGroup] = useState(currentGroup ?? '');
  const [creating, setCreating] = useState(false);
  useResetOn(open, () => open && setGroup(currentGroup ?? ''));
  const move = useMutation({
    mutationFn: () => api.post<{ moved: number }>('/parties/move-group', { parties: partyIds, group: group || null }),
    onSuccess: () => {
      invalidateCompany(qc, cid);
      toast.success(partyIds.length > 1 ? `${partyIds.length} parties moved` : 'Party moved');
      onDone?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        size="sm"
        title={partyIds.length > 1 ? `Move ${partyIds.length} parties to a group` : 'Move party to a group'}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => move.mutate()} loading={move.isPending}>
              Move
            </Button>
          </>
        }
      >
        <Field label="Group">
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">No group</option>
            {(groups.data?.groups ?? []).map((g) => (
              <option key={g._id} value={g._id}>
                {g.name} ({g.parties})
              </option>
            ))}
          </Select>
        </Field>
        <button type="button" onClick={() => setCreating(true)} className="mt-2 text-sm font-medium text-blue-600 hover:underline">
          + Create a new group
        </button>
      </Modal>
      <GroupModal open={creating} onOpenChange={setCreating} onSaved={(g) => setGroup(g._id)} />
    </>
  );
}
