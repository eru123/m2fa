import { invoke } from "@tauri-apps/api/core";
import type { AccountMeta, CodeSet, ImportSummary } from "./types";

export const api = {
  listAccounts: () => invoke<AccountMeta[]>("list_accounts"),
  getCodes: () => invoke<CodeSet[]>("get_codes"),
  importLines: (content: string) => invoke<ImportSummary>("import_lines", { content }),
  deleteAccount: (id: string) => invoke<boolean>("delete_account", { id }),
  deleteAccounts: (ids: string[]) => invoke<number>("delete_accounts", { ids }),
  updateAccount: (id: string, label: string, issuer: string) =>
    invoke<boolean>("update_account", { id, label, issuer }),
  exportAccounts: (ids: string[]) => invoke<string>("export_accounts", { ids }),
  copyText: (text: string) => invoke<void>("copy_to_clipboard", { text }),
};
