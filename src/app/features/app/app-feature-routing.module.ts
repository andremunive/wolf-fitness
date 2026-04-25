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
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AppFeatureRoutingModule {}
