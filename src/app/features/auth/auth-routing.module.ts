import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { firstLoginGuard } from 'src/app/core/guards/first-login.guard';
import { publicOnlyGuard } from 'src/app/core/guards/public-only.guard';

import { LoginPageComponent } from './pages/login/login-page.component';
import { ChangePasswordPageComponent } from './pages/cambiar-clave/change-password-page.component';

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  },
  {
    path: 'login',
    component: LoginPageComponent,
    canActivate: [publicOnlyGuard]
  },
  {
    path: 'cambiar-clave',
    component: ChangePasswordPageComponent,
    canActivate: [firstLoginGuard]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule {}
