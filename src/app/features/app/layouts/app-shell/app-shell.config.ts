import { UserRole } from 'src/app/core/types/supabase';

export type NavIconKey = 'users' | 'dumbbell' | 'chart' | 'dollar' | 'box' | 'briefcase' | 'receipt';

export interface NavMenuItem {
  label: string;
  description: string;
  iconKey: NavIconKey;
  routerLink: string;
  /** Roles que pueden ver este item. Omitir = visible para todos los roles que pasan el filtro de la sección. */
  allowedRoles?: UserRole[];
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
        // Sin allowedRoles: visible para admin y trainer (todos los que pasan el filtro de la sección).
      },
      {
        label: 'Entrenadores',
        description: 'Gestiona el equipo de entrenadores y sus clientes asignados.',
        iconKey: 'briefcase',
        routerLink: '/app/entrenadores',
        allowedRoles: ['admin']
      },
      {
        label: 'Proveedores',
        description: 'Personal externo y proveedores de servicio del gimnasio.',
        iconKey: 'box',
        routerLink: '/app/proveedores',
        allowedRoles: ['admin']
      }
    ]
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    description: 'Cierres quincenales y pagos del gimnasio.',
    triggerIcon: 'dollar',
    allowedRoles: ['admin', 'trainer'],
    items: [
      {
        label: 'Cierres',
        description: 'Cierre quincenal de pago a entrenadores: cards del mes actual e histórico.',
        iconKey: 'dollar',
        routerLink: '/app/cierres'
        // Sin allowedRoles: visible para admin y trainer (que pasan el filtro de la sección).
      },
      {
        label: 'Registro',
        description: 'Registro cronológico de egresos del gimnasio por categoría.',
        iconKey: 'receipt',
        routerLink: '/app/registro',
        allowedRoles: ['admin']
      }
    ]
  },
  {
    id: 'estadisticas',
    label: 'Estadísticas',
    description: 'Métricas e indicadores del gimnasio.',
    triggerIcon: 'chart',
    allowedRoles: ['admin', 'trainer'],
    items: [
      {
        label: 'Clientes',
        description: 'Métricas de clientes activos, retención y comportamiento de pago.',
        iconKey: 'chart',
        routerLink: '/app/estadisticas/clientes'
      }
    ]
  }
];
