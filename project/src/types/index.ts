export interface DatasetRecord {
  dataset: string;
  run_id: string;
  linkid: string;
  rule_count: number;
}

export interface RuleBreakRecord {
  dataset: string;
  run_id: string;
  rule_nm: string;
  record_json: Record<string, string>;
}