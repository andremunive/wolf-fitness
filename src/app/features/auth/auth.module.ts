import { NgModule } from '@angular/core';
import { SharedModule } from 'src/app/shared/shared.module';

import { AuthRoutingModule } from './auth-routing.module';
import { LoginPageComponent } from './pages/login/login-page.component';
import { ChangePasswordPageComponent } from './pages/cambiar-clave/change-password-page.component';

@NgModule({
  declarations: [LoginPageComponent, ChangePasswordPageComponent],
  imports: [SharedModule, AuthRoutingModule]
})
export class AuthModule {}
