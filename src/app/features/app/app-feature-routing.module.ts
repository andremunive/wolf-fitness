import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { authGuard } from 'src/app/core/guards/auth.guard';
import { roleGuard } from 'src/app/core/guards/role.guard';

import { AppShellComponent } from './layouts/app-shell/app-shell.component';
import { HomePageComponent } from './pages/home/home-page.component';

const routes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        component: HomePageComponent
      },
      {
        path: 'clientes',
        loadChildren: () =>
          import('./clients/clients.module').then((m) => m.ClientsModule),
        canActivate: [roleGuard(['admin', 'trainer'])]
      },
      {
        path: 'entrenadores',
        loadChildren: () =>
          import('./trainers/trainers.module').then((m) => m.TrainersModule),
        canActivate: [roleGuard(['admin'])]
      },
      {
        path: 'proveedores',
        loadChildren: () =>
          import('./service-providers/service-providers.module').then(
            (m) => m.ServiceProvidersModule
          ),
        canActivate: [roleGuard(['admin'])]
      },
      {
        path: 'cierres',
        loadChildren: () =>
          import('./closures/closures.module').then((m) => m.ClosuresModule),
        canActivate: [roleGuard(['admin', 'trainer'])]
      },
      {
        path: 'registro',
        loadChildren: () =>
          import('./expense-records/expense-records.module').then((m) => m.ExpenseRecordsModule),
        canActivate: [roleGuard(['admin'])]
      },
      {
        path: 'prestamos',
        loadChildren: () =>
          import('./prestamos/prestamos.module').then((m) => m.PrestamosModule),
        canActivate: [roleGuard(['admin'])]
      },
      {
        path: 'descuentos',
        loadChildren: () =>
          import('./discounts/discounts.module').then((m) => m.DiscountsModule),
        canActivate: [roleGuard(['admin'])]
      },
      {
        path: 'estadisticas',
        loadChildren: () =>
          import('./estadisticas/estadisticas.module').then((m) => m.EstadisticasModule),
        canActivate: [roleGuard(['admin', 'trainer'])]
      },
      {
        path: 'contabilidad',
        loadChildren: () =>
          import('./contabilidad/contabilidad.module').then((m) => m.ContabilidadModule),
        canActivate: [roleGuard(['admin'])]
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AppFeatureRoutingModule {}
