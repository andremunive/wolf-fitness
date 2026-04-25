import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

import {
  Client,
  ClientPlan,
  ClientStatus,
  ClientsPage,
  ClientsQueryParams,
  TrainerOption
} from '../models/client.model';

const MOCK_TRAINERS: TrainerOption[] = [
  { id: 't1', name: 'Carlos Restrepo' },
  { id: 't2', name: 'Valentina Gómez' },
  { id: 't3', name: 'Andrés Morales' },
  { id: 't4', name: 'Juliana Ríos' },
  { id: 't5', name: 'Sebastián Castro' }
];

function date(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

function nextPaymentFrom(start: Date): Date {
  const d = new Date(start);
  d.setMonth(d.getMonth() + 1);
  return d;
}

const RAW_CLIENTS: Omit<Client, 'planLabel' | 'monthlyFee'>[] = [
  { id: 'c01', fullName: 'María Camila Torres', email: 'mcamila@gmail.com', phone: '+57 312 456 7890', plan: '6_days', status: 'active', trainerId: 't1', trainerName: 'Carlos Restrepo', startDate: date(2024, 3, 10), lastPaymentDate: date(2025, 3, 10), nextPaymentDate: date(2025, 4, 10) },
  { id: 'c02', fullName: 'Juan Pablo Herrera', email: 'jpherrera@hotmail.com', phone: '+57 300 789 1234', plan: '3_days', status: 'active', trainerId: 't2', trainerName: 'Valentina Gómez', startDate: date(2024, 6, 1), lastPaymentDate: date(2025, 3, 1), nextPaymentDate: date(2025, 4, 1) },
  { id: 'c03', fullName: 'Laura Sofía Vargas', email: 'lvargas@gmail.com', phone: '+57 315 234 5678', plan: '6_days', status: 'active', trainerId: 't1', trainerName: 'Carlos Restrepo', startDate: date(2023, 11, 15), lastPaymentDate: date(2025, 3, 15), nextPaymentDate: date(2025, 4, 15) },
  { id: 'c04', fullName: 'Diego Alejandro Ruiz', email: 'diegoruiz@outlook.com', phone: '+57 320 345 6789', plan: '3_days', status: 'inactive', trainerId: 't3', trainerName: 'Andrés Morales', startDate: date(2024, 1, 20), lastPaymentDate: date(2024, 12, 20), nextPaymentDate: date(2025, 1, 20) },
  { id: 'c05', fullName: 'Valentina Martínez', email: 'valmar@gmail.com', phone: '+57 310 456 7891', plan: '6_days', status: 'active', trainerId: 't2', trainerName: 'Valentina Gómez', startDate: date(2024, 8, 5), lastPaymentDate: date(2025, 3, 5), nextPaymentDate: date(2025, 4, 5) },
  { id: 'c06', fullName: 'Sebastián López', email: 'slopez@gmail.com', phone: '+57 318 567 8902', plan: '3_days', status: 'suspended', trainerId: 't4', trainerName: 'Juliana Ríos', startDate: date(2024, 2, 14), lastPaymentDate: null, nextPaymentDate: date(2024, 3, 14) },
  { id: 'c07', fullName: 'Alejandra Pinto', email: 'aleja.pinto@gmail.com', phone: '+57 321 678 9013', plan: '6_days', status: 'active', trainerId: 't5', trainerName: 'Sebastián Castro', startDate: date(2024, 5, 22), lastPaymentDate: date(2025, 3, 22), nextPaymentDate: date(2025, 4, 22) },
  { id: 'c08', fullName: 'Felipe Osorio', email: 'fosorio@yahoo.com', phone: '+57 302 789 0124', plan: '6_days', status: 'active', trainerId: 't1', trainerName: 'Carlos Restrepo', startDate: date(2023, 9, 30), lastPaymentDate: date(2025, 3, 30), nextPaymentDate: date(2025, 4, 30) },
  { id: 'c09', fullName: 'Natalia Romero', email: 'nromero@gmail.com', phone: '+57 311 890 1235', plan: '3_days', status: 'active', trainerId: 't3', trainerName: 'Andrés Morales', startDate: date(2024, 10, 8), lastPaymentDate: date(2025, 3, 8), nextPaymentDate: date(2025, 4, 8) },
  { id: 'c10', fullName: 'Camilo Jiménez', email: 'cjimenez@gmail.com', phone: '+57 314 901 2346', plan: '6_days', status: 'active', trainerId: 't2', trainerName: 'Valentina Gómez', startDate: date(2024, 7, 17), lastPaymentDate: date(2025, 3, 17), nextPaymentDate: date(2025, 4, 17) },
  { id: 'c11', fullName: 'Sara Galvis', email: 'sgalvis@gmail.com', phone: '+57 317 012 3457', plan: '3_days', status: 'inactive', trainerId: 't5', trainerName: 'Sebastián Castro', startDate: date(2024, 4, 3), lastPaymentDate: date(2025, 1, 3), nextPaymentDate: date(2025, 2, 3) },
  { id: 'c12', fullName: 'Daniel Cárdenas', email: 'dcardenas@hotmail.com', phone: '+57 322 123 4568', plan: '6_days', status: 'active', trainerId: 't4', trainerName: 'Juliana Ríos', startDate: date(2023, 12, 1), lastPaymentDate: date(2025, 3, 1), nextPaymentDate: date(2025, 4, 1) },
  { id: 'c13', fullName: 'Paola Suárez', email: 'psuarez@outlook.com', phone: '+57 313 234 5679', plan: '3_days', status: 'active', trainerId: 't1', trainerName: 'Carlos Restrepo', startDate: date(2025, 1, 15), lastPaymentDate: date(2025, 3, 15), nextPaymentDate: date(2025, 4, 15) },
  { id: 'c14', fullName: 'Mateo Arango', email: 'marango@gmail.com', phone: '+57 316 345 6780', plan: '6_days', status: 'suspended', trainerId: 't3', trainerName: 'Andrés Morales', startDate: date(2024, 3, 28), lastPaymentDate: null, nextPaymentDate: date(2024, 4, 28) },
  { id: 'c15', fullName: 'Isabela Ortiz', email: 'iortiz@gmail.com', phone: '+57 319 456 7891', plan: '6_days', status: 'active', trainerId: 't2', trainerName: 'Valentina Gómez', startDate: date(2024, 9, 11), lastPaymentDate: date(2025, 3, 11), nextPaymentDate: date(2025, 4, 11) },
  { id: 'c16', fullName: 'Andrés Felipe Mora', email: 'afmora@gmail.com', phone: '+57 303 567 8902', plan: '3_days', status: 'active', trainerId: 't5', trainerName: 'Sebastián Castro', startDate: date(2024, 11, 6), lastPaymentDate: date(2025, 3, 6), nextPaymentDate: date(2025, 4, 6) },
  { id: 'c17', fullName: 'Luisa Fernanda Arias', email: 'lfarias@gmail.com', phone: '+57 308 678 9013', plan: '6_days', status: 'active', trainerId: 't1', trainerName: 'Carlos Restrepo', startDate: date(2023, 8, 20), lastPaymentDate: date(2025, 3, 20), nextPaymentDate: date(2025, 4, 20) },
  { id: 'c18', fullName: 'Ricardo Peña', email: 'rpena@yahoo.com', phone: '+57 323 789 0124', plan: '3_days', status: 'inactive', trainerId: 't4', trainerName: 'Juliana Ríos', startDate: date(2024, 5, 9), lastPaymentDate: date(2024, 11, 9), nextPaymentDate: date(2024, 12, 9) },
  { id: 'c19', fullName: 'Gloria Inés Zapata', email: 'gzapata@gmail.com', phone: '+57 301 890 1235', plan: '6_days', status: 'active', trainerId: 't3', trainerName: 'Andrés Morales', startDate: date(2024, 2, 25), lastPaymentDate: date(2025, 3, 25), nextPaymentDate: date(2025, 4, 25) },
  { id: 'c20', fullName: 'Tomás Echeverri', email: 'techeverri@gmail.com', phone: '+57 309 901 2346', plan: '3_days', status: 'active', trainerId: 't2', trainerName: 'Valentina Gómez', startDate: date(2025, 2, 3), lastPaymentDate: date(2025, 3, 3), nextPaymentDate: date(2025, 4, 3) },
  { id: 'c21', fullName: 'Carolina Bustamante', email: 'cbustamante@hotmail.com', phone: '+57 315 012 3457', plan: '6_days', status: 'active', trainerId: 't5', trainerName: 'Sebastián Castro', startDate: date(2024, 6, 18), lastPaymentDate: date(2025, 3, 18), nextPaymentDate: date(2025, 4, 18) },
  { id: 'c22', fullName: 'Jhon Esteban Palacio', email: 'jepalacio@gmail.com', phone: '+57 320 123 4568', plan: '3_days', status: 'suspended', trainerId: 't1', trainerName: 'Carlos Restrepo', startDate: date(2023, 10, 12), lastPaymentDate: null, nextPaymentDate: date(2024, 1, 12) },
  { id: 'c23', fullName: 'Manuela Correa', email: 'mcorrea@outlook.com', phone: '+57 312 234 5679', plan: '6_days', status: 'active', trainerId: 't4', trainerName: 'Juliana Ríos', startDate: date(2024, 12, 1), lastPaymentDate: date(2025, 3, 1), nextPaymentDate: date(2025, 4, 1) },
  { id: 'c24', fullName: 'Esteban Salcedo', email: 'esalcedo@gmail.com', phone: '+57 300 345 6780', plan: '3_days', status: 'active', trainerId: 't3', trainerName: 'Andrés Morales', startDate: date(2024, 8, 29), lastPaymentDate: date(2025, 3, 29), nextPaymentDate: date(2025, 4, 29) },
  { id: 'c25', fullName: 'Daniela Montoya', email: 'dmontoya@gmail.com', phone: '+57 318 456 7891', plan: '6_days', status: 'active', trainerId: 't2', trainerName: 'Valentina Gómez', startDate: date(2024, 4, 14), lastPaymentDate: date(2025, 3, 14), nextPaymentDate: date(2025, 4, 14) },
  { id: 'c26', fullName: 'Cristian Castaño', email: 'ccastano@gmail.com', phone: '+57 321 567 8902', plan: '3_days', status: 'inactive', trainerId: 't5', trainerName: 'Sebastián Castro', startDate: date(2024, 1, 7), lastPaymentDate: date(2024, 10, 7), nextPaymentDate: date(2024, 11, 7) },
  { id: 'c27', fullName: 'Verónica Henao', email: 'vhenao@yahoo.com', phone: '+57 311 678 9013', plan: '6_days', status: 'active', trainerId: 't1', trainerName: 'Carlos Restrepo', startDate: date(2024, 10, 23), lastPaymentDate: date(2025, 3, 23), nextPaymentDate: date(2025, 4, 23) },
  { id: 'c28', fullName: 'Alejandro Giraldo', email: 'agiraldo@hotmail.com', phone: '+57 314 789 0124', plan: '3_days', status: 'active', trainerId: 't4', trainerName: 'Juliana Ríos', startDate: date(2025, 1, 30), lastPaymentDate: date(2025, 3, 30), nextPaymentDate: date(2025, 4, 30) },
  { id: 'c29', fullName: 'Mariana Londoño', email: 'mlondono@gmail.com', phone: '+57 302 890 1235', plan: '6_days', status: 'active', trainerId: 't3', trainerName: 'Andrés Morales', startDate: date(2023, 7, 4), lastPaymentDate: date(2025, 3, 4), nextPaymentDate: date(2025, 4, 4) },
  { id: 'c30', fullName: 'Simón Betancur', email: 'sbetancur@gmail.com', phone: '+57 316 901 2346', plan: '3_days', status: 'suspended', trainerId: 't2', trainerName: 'Valentina Gómez', startDate: date(2024, 7, 16), lastPaymentDate: null, nextPaymentDate: date(2024, 8, 16) },
  { id: 'c31', fullName: 'Ana Lucía Mejía', email: 'almejia@gmail.com', phone: '+57 319 012 3457', plan: '6_days', status: 'active', trainerId: 't5', trainerName: 'Sebastián Castro', startDate: date(2024, 3, 1), lastPaymentDate: date(2025, 3, 1), nextPaymentDate: date(2025, 4, 1) },
  { id: 'c32', fullName: 'Harold Vergara', email: 'hvergara@outlook.com', phone: '+57 308 123 4568', plan: '3_days', status: 'active', trainerId: 't1', trainerName: 'Carlos Restrepo', startDate: date(2024, 11, 19), lastPaymentDate: date(2025, 3, 19), nextPaymentDate: date(2025, 4, 19) },
  { id: 'c33', fullName: 'Natalia Escobar', email: 'nescobar@gmail.com', phone: '+57 322 234 5679', plan: '6_days', status: 'active', trainerId: 't4', trainerName: 'Juliana Ríos', startDate: date(2024, 9, 6), lastPaymentDate: date(2025, 3, 6), nextPaymentDate: date(2025, 4, 6) },
  { id: 'c34', fullName: 'Miguel Ángel Cano', email: 'macano@gmail.com', phone: '+57 303 345 6780', plan: '3_days', status: 'inactive', trainerId: 't3', trainerName: 'Andrés Morales', startDate: date(2023, 6, 27), lastPaymentDate: date(2024, 9, 27), nextPaymentDate: date(2024, 10, 27) },
  { id: 'c35', fullName: 'Stefanía Agudelo', email: 'sagudelo@gmail.com', phone: '+57 317 456 7891', plan: '6_days', status: 'active', trainerId: 't2', trainerName: 'Valentina Gómez', startDate: date(2025, 2, 14), lastPaymentDate: date(2025, 3, 14), nextPaymentDate: date(2025, 4, 14) }
];

const PLAN_LABELS: Record<string, string> = {
  '6_days': '6 días/semana',
  '3_days': '3 días/semana'
};

const PLAN_FEES: Record<string, number> = {
  '6_days': 200000,
  '3_days': 150000
};

const MOCK_CLIENTS: Client[] = RAW_CLIENTS.map((c) => ({
  ...c,
  planLabel: PLAN_LABELS[c.plan],
  monthlyFee: PLAN_FEES[c.plan]
}));

@Injectable({ providedIn: 'root' })
export class ClientsMockService {
  getClients(params: ClientsQueryParams): Observable<ClientsPage> {
    const filtered = this.applyFilters(params);
    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const items = filtered.slice(start, start + params.pageSize);

    // Simula latencia de red con un delay aleatorio entre 300 y 500ms.
    const networkDelay = 300 + Math.floor(Math.random() * 200);
    return of({ items, total }).pipe(delay(networkDelay));
  }

  getTrainers(): Observable<TrainerOption[]> {
    return of(MOCK_TRAINERS).pipe(delay(200));
  }

  private applyFilters(params: ClientsQueryParams): Client[] {
    const searchTerm = (params.search ?? '').toLowerCase().trim();

    return MOCK_CLIENTS.filter((client) => {
      if (searchTerm) {
        const matchesName = client.fullName.toLowerCase().includes(searchTerm);
        const matchesEmail = client.email.toLowerCase().includes(searchTerm);
        const matchesPhone = client.phone.includes(searchTerm);
        if (!matchesName && !matchesEmail && !matchesPhone) {
          return false;
        }
      }

      if (params.trainerId && params.trainerId !== 'all') {
        if (client.trainerId !== params.trainerId) {
          return false;
        }
      }

      if (params.status && params.status !== 'all') {
        if (client.status !== params.status) {
          return false;
        }
      }

      if (params.plan && params.plan !== 'all') {
        if (client.plan !== params.plan) {
          return false;
        }
      }

      return true;
    });
  }
}
