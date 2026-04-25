export type ClientPlan = '6_days' | '3_days';
export type ClientStatus = 'active' | 'inactive' | 'suspended';

export interface Client {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  plan: ClientPlan;
  planLabel: string;
  status: ClientStatus;
  trainerId: string;
  trainerName: string;
  startDate: Date;
  lastPaymentDate: Date | null;
  nextPaymentDate: Date;
  /** Mensualidad en COP */
  monthlyFee: number;
}

export interface TrainerOption {
  id: string;
  name: string;
}

export interface ClientsQueryParams {
  search?: string;
  trainerId?: string;
  status?: ClientStatus | 'all';
  plan?: ClientPlan | 'all';
  page: number;
  pageSize: number;
}

export interface ClientsPage {
  items: Client[];
  total: number;
}
