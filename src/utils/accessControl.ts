import { SystemUser } from '../types';

/**
 * Checks if the user has permission to manage system users (Owner only).
 */
export const canManageUsers = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager';
};

/**
 * Checks if the user can view profit and detailed financial reports (Owner only).
 */
export const canViewProfit = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager';
};

/**
 * Checks if the user can manage system settings (Owner only).
 */
export const canManageSettings = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager';
};

/**
 * Checks if the user can manually resume the sync engine (Owner only).
 */
export const canResumeSync = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager';
};

/**
 * Checks if the user can void or delete transactions (Owner only).
 */
export const canDeleteTransaction = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager';
};

/**
 * Checks if the user can manage the service catalog (Owner only).
 */
export const canManageCatalog = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager';
};

/**
 * Checks if the user can perform checkouts at the POS terminal (Owner and Cashier).
 */
export const canCheckout = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager' || user?.role === 'Kasir/Front Desk';
};

/**
 * Checks if the user can manage customer records (Owner and Cashier).
 */
export const canManageCustomers = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager' || user?.role === 'Kasir/Front Desk';
};

/**
 * Checks if the user can manage cash shifts (Owner and Cashier).
 */
export const canManageShifts = (user: SystemUser | null | undefined): boolean => {
  return user?.role === 'Owner/Manager' || user?.role === 'Kasir/Front Desk';
};
