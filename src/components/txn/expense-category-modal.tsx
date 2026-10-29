'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { useCompany } from '@/providers/company';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';

export type ExpenseKind = 'direct' | 'indirect';
interface SavedCategory {
  _id: string;
  name: string;
  kind: ExpenseKind;
}

/** Create or rename an expense category (Rent, Salary, Transport…). */
export function ExpenseCategoryModal({ open, onOpenChange, category, initialName, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category?: { _id: string; name: string; kind?: ExpenseKind } | null;
  initialName?: string;
  onSaved?: (c: SavedCategory) => void;
}) {
  const { cid } = useCompany();
  const qc = useQueryClient();
  const [name, setName] = useState(category?.name ?? initialName ?? '');
  const [kind, setKind] = useState<ExpenseKind>(category?.kind ?? 'indirect');
  useResetOn(open ? (category?._id ?? `new:${initialName ?? ''}`) : null, () => {
    if (!open) return;
    setName(category?.name ?? initialName ?? '');
    setKind(category?.kind ?? 'indirect');
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), kind };
      const res = category ? await api.put<SavedCategory>(`/finance/expense-categories/${category._id}`, body) : await api.post<SavedCategory>('/finance/expense-categories', body);
      return res.data;
    },
    onSuccess: (c) => {
      invalidateCompany(qc, cid);
      toast.success(category ? 'Category updated' : `Category "${c.name}" created`);
      onSaved?.(c);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = () => {
    if (name.trim()) save.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={category ? 'Edit expense category' : 'Add expense category'}
      description="Group spending such as rent, salaries, electricity or transport to see where money goes."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Category name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shop rent" maxLength={80} />
        </Field>
        <Field label="Expense type" hint="Direct expenses (freight in, wages on production) reduce gross profit; indirect ones (rent, salaries, marketing) reduce net profit.">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)}>
            <option value="indirect">Indirect expense</option>
            <option value="direct">Direct expense</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
