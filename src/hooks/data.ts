'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BankAccount, Item, Party, Unit } from '@/lib/types';
import { useCompany } from '@/providers/company';

/** Shared lookup lists used by pickers. Keys are prefixed with the company id so switching company never leaks data. */

export function useParties(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'parties', 'all'],
    queryFn: async () => (await api.get<Party[]>('/parties', { limit: 5000 })).data,
    enabled: enabled && can('parties.view'),
    staleTime: 30_000,
  });
}

export function useItems(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'items', 'all'],
    queryFn: async () => (await api.get<Item[]>('/items', { limit: 5000 })).data,
    enabled: enabled && can('items.view'),
    staleTime: 30_000,
  });
}

export function useAccountOptions() {
  const { cid } = useCompany();
  return useQuery({
    queryKey: [cid, 'accounts', 'options'],
    queryFn: async () => (await api.get<Pick<BankAccount, '_id' | 'name' | 'kind' | 'isDefault'>[]>('/finance/accounts/options')).data,
    staleTime: 60_000,
  });
}

export interface PartyGroupRow {
  _id: string;
  name: string;
  description?: string;
  parties: number;
  receivable: number;
  payable: number;
}

export function usePartyGroups(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'parties', 'groups'],
    queryFn: async () => (await api.get<{ groups: PartyGroupRow[]; ungrouped: Omit<PartyGroupRow, '_id' | 'name'> }>('/parties/groups')).data,
    enabled: enabled && can('parties.view'),
  });
}

export interface CategoryRow {
  _id: string;
  name: string;
  items: number;
  stockValue: number;
}

export function useCategories(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'items', 'categories'],
    queryFn: async () => (await api.get<{ categories: CategoryRow[]; uncategorised: { items: number; stockValue: number } }>('/items/categories')).data,
    enabled: enabled && can('items.view'),
  });
}

export interface UnitConversionRow {
  _id: string;
  baseUnit: Unit;
  secondaryUnit: Unit;
  rate: number;
}

export function useUnits(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'items', 'units'],
    queryFn: async () => (await api.get<{ units: Unit[]; conversions: UnitConversionRow[] }>('/items/units')).data,
    enabled: enabled && can('items.view'),
    staleTime: 60_000,
  });
}

export interface ExpenseCategoryRow {
  _id: string;
  name: string;
  kind: 'direct' | 'indirect';
  total: number;
  balance: number;
  count: number;
}

export function useExpenseCategories(range?: { from?: string; to?: string }) {
  const { cid } = useCompany();
  return useQuery({
    queryKey: [cid, 'expense-categories', range?.from ?? '', range?.to ?? ''],
    queryFn: async () => (await api.get<ExpenseCategoryRow[]>('/finance/expense-categories', { from: range?.from, to: range?.to })).data,
  });
}

export interface EmployeeRow {
  _id: string;
  name: string;
  code?: string;
  phone?: string;
  email?: string;
  designation?: string;
  department?: string;
  joinDate?: string;
  salaryType: 'monthly' | 'daily';
  salary: number;
  allowances: number;
  deductions: number;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  address?: string;
  emergencyContact?: string;
  photo?: string | null;
  status: 'active' | 'inactive';
  user?: { _id: string; name: string; email?: string } | string | null;
}

export function useEmployees(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'hr', 'employees', 'all'],
    queryFn: async () => (await api.get<EmployeeRow[]>('/hr/employees', { limit: 2000 })).data,
    enabled: enabled && can('employees.view', 'attendance.view', 'payroll.view', 'hr_requests.manage', 'employees.manage', 'attendance.manage', 'payroll.manage'),
  });
}
