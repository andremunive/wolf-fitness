import { NgModule } from '@angular/core';

import { SharedModule } from 'src/app/shared/shared.module';

import { TrainersRoutingModule } from './trainers-routing.module';
import { TrainersListPageComponent } from './pages/trainers-list/trainers-list-page.component';
import { TrainersSearchBarComponent } from './components/trainers-search-bar/trainers-search-bar.component';
import { TrainerCardComponent } from './components/trainer-card/trainer-card.component';
import { TrainersTableComponent } from './components/trainers-table/trainers-table.component';
import { TrainersPaginationComponent } from './components/trainers-pagination/trainers-pagination.component';
import { TrainerActionsMenuComponent } from './components/trainer-actions-menu/trainer-actions-menu.component';
import { TrainersFiltersComponent } from './components/trainers-filters/trainers-filters.component';
import { NewTrainerWizardComponent } from './components/new-trainer-wizard/new-trainer-wizard.component';
import { TrainerCreatedModalComponent } from './components/trainer-created-modal/trainer-created-modal.component';
import { EditTrainerModalComponent } from './components/edit-trainer-modal/edit-trainer-modal.component';

@NgModule({
  declarations: [
    TrainersListPageComponent,
    TrainersSearchBarComponent,
    TrainerCardComponent,
    TrainersTableComponent,
    TrainersPaginationComponent,
    TrainerActionsMenuComponent,
    TrainersFiltersComponent,
    NewTrainerWizardComponent,
    TrainerCreatedModalComponent,
    EditTrainerModalComponent
  ],
  imports: [
    SharedModule,
    TrainersRoutingModule
  ]
})
export class TrainersModule {}
