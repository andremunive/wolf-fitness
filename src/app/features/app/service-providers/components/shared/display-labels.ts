import { Bank, DocumentType, ProviderEntityType } from '../../models/service-provider.model';

/** Human-readable bank names for display in cards, tables and modals. */
export const BANK_LABELS: Record<Bank, string> = {
  bancolombia: 'Bancolombia',
  nequi: 'Nequi',
  davivienda: 'Davivienda',
  banco_de_bogota: 'Banco de Bogotá',
  bbva: 'BBVA',
  banco_popular: 'Banco Popular',
  banco_caja_social: 'Banco Caja Social',
  colpatria: 'Colpatria',
  itau: 'Itaú',
  scotiabank: 'Scotiabank',
  otro: 'Otro'
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cc: 'CC',
  ce: 'CE',
  ti: 'TI',
  pa: 'PA',
  nit: 'NIT'
};

export const ENTITY_TYPE_LABELS: Record<ProviderEntityType, string> = {
  persona: 'Persona natural',
  empresa: 'Empresa'
};
