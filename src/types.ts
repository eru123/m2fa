export interface AccountMeta {
  id: string;
  label: string;
  issuer: string;
  algorithm: string;
  digits: number;
  period: number;
  created_at: number;
}

export interface CodeSet {
  id: string;
  label: string;
  issuer: string;
  prev: string;
  current: string;
  next: string;
  period: number;
  remaining_ms: number;
}

export interface ImportSummary {
  imported: number;
  duplicated: number;
  failed: number;
  errors: string[];
}
