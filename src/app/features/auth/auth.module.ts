import { NgModule } from '@angular/core';
import { SharedModule } from 'src/app/shared/shared.module';

import { AuthRoutingModule } from './auth-routing.module';
import { LoginPageComponent } from './pages/login/login-page.component';

@NgModule({
  declarations: [LoginPageComponent],
  imports: [SharedModule, AuthRoutingModule]
})
export class AuthModule {}
