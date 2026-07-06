import { UserRole } from 'src/app/core/types/supabase';

export type NavIconKey =
  | 'users'
  | 'dumbbell'
  | 'chart'
  | 'dollar'
  | 'box'
  | 'briefcase'
  | 'receipt'
  | 'banknote'
  | 'file-text'
  | 'coffee'
  | 'shopping-cart'
  | 'book-open'
  | 'package'
  | 'archive'
  | 'bar-chart';

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
    allowedRoles: ['admin', 'trainer', 'csm'],
    items: [
      {
        label: 'Clientes',
        description: 'Tus clientes organizados por estado, activos, invitados y leads.',
        iconKey: 'users',
        routerLink: '/app/clientes',
        allowedRoles: ['admin', 'trainer', 'csm']
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
      },
      {
        label: 'Préstamos',
        description: 'Préstamos activos e historial de pagos.',
        iconKey: 'banknote',
        routerLink: '/app/prestamos',
        allowedRoles: ['admin']
      }
    ]
  },
  {
    id: 'estadisticas',
    label: 'Estadísticas',
    description: 'Métricas e indicadores del gimnasio.',
    triggerIcon: 'chart',
    allowedRoles: ['admin', 'trainer', 'csm'],
    items: [
      {
        label: 'Clientes',
        description: 'Métricas de clientes activos, retención y comportamiento de pago.',
        iconKey: 'chart',
        routerLink: '/app/estadisticas/clientes'
        // Sin allowedRoles: visible para admin, trainer y csm (todos los que pasan el filtro de la sección).
      },
      {
        label: 'Finanzas',
        description: 'Ingresos, egresos y estado de caja del gimnasio.',
        iconKey: 'chart',
        routerLink: '/app/estadisticas/finanzas',
        allowedRoles: ['admin', 'trainer']
      }
    ]
  },
  {
    id: 'contabilidad',
    label: 'Contabilidad',
    description: 'Informes financieros consolidados del gimnasio.',
    triggerIcon: 'file-text',
    allowedRoles: ['admin'],
    items: [
      {
        label: 'Estado de Resultados',
        description: 'P&G mensual, trimestral y semestral.',
        iconKey: 'file-text',
        routerLink: '/app/contabilidad/estado-de-resultados'
      },
      {
        label: 'Flujo de Caja',
        description: 'Movimientos reales de caja por período.',
        iconKey: 'file-text',
        routerLink: '/app/contabilidad/flujo-de-caja'
      }
    ]
  },
  {
    id: 'cafeteria',
    label: 'Cafetería',
    description: 'Ventas, catálogo, insumos y cierres de cafetería.',
    triggerIcon: 'coffee',
    allowedRoles: ['admin'],
    items: [
      {
        label: 'Ventas',
        description: 'Registro de ventas de cafetería.',
        iconKey: 'shopping-cart',
        routerLink: '/app/cafeteria/ventas',
        allowedRoles: ['admin']
      },
      {
        label: 'Catálogo',
        description: 'Productos, presentaciones y combos.',
        iconKey: 'book-open',
        routerLink: '/app/cafeteria/catalogo',
        allowedRoles: ['admin']
      },
      {
        label: 'Insumos',
        description: 'Registro de costos de cafetería.',
        iconKey: 'package',
        routerLink: '/app/cafeteria/insumos',
        allowedRoles: ['admin']
      },
      {
        label: 'Cierres',
        description: 'Cierres quincenales de cafetería.',
        iconKey: 'archive',
        routerLink: '/app/cafeteria/cierres',
        allowedRoles: ['admin']
      },
      {
        label: 'Dashboard',
        description: 'Estadísticas de cafetería.',
        iconKey: 'bar-chart',
        routerLink: '/app/cafeteria/dashboard',
        allowedRoles: ['admin']
      }
    ]
  }
];
