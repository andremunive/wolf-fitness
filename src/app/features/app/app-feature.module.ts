import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { AppFeatureRoutingModule } from './app-feature-routing.module';
import { AppShellComponent } from './layouts/app-shell/app-shell.component';
import { TopBarComponent } from './layouts/app-shell/components/top-bar/top-bar.component';
import { NavMenuItemComponent } from './layouts/app-shell/components/top-bar/components/nav-menu-item/nav-menu-item.component';
import { UserMenuComponent } from './layouts/app-shell/components/top-bar/components/user-menu/user-menu.component';
import { MobileDrawerComponent } from './layouts/app-shell/components/top-bar/components/mobile-drawer/mobile-drawer.component';
import { HomePageComponent } from './pages/home/home-page.component';

@NgModule({
  declarations: [
    AppShellComponent,
    TopBarComponent,
    NavMenuItemComponent,
    UserMenuComponent,
    MobileDrawerComponent,
    HomePageComponent
  ],
  imports: [SharedModule, AppFeatureRoutingModule]
})
export class AppFeatureModule {}
