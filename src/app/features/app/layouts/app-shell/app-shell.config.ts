import { UserRole } from 'src/app/core/types/supabase';

export type NavIconKey = 'users' | 'dumbbell' | 'chart' | 'dollar' | 'box';

export interface NavMenuItem {
  label: string;
  description: string;
  iconKey: NavIconKey;
  routerLink: string;
}

export interface NavMenuSection {
  id: string;
  label: string;
  /** Short description shown in the dropdown header. */
  description: string;
  /** Icon shown in the top-bar trigger button (left of label). */
  triggerIcon: NavIconKey;
  allowedRoles: UserRole[];
  items: NavMenuItem[];
}

export const NAV_SECTIONS: NavMenuSection[] = [
  {
    id: 'personal',
    label: 'Personal',
    description: 'Administra el equipo y los clientes del gimnasio.',
    triggerIcon: 'users',
    allowedRoles: ['admin', 'trainer'],
    items: [
      {
        label: 'Clientes',
        description: 'Tus clientes organizados por estado, activos, invitados y leads.',
        iconKey: 'users',
        routerLink: '/app/clientes'
      }
    ]
  }
];
