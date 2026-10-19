import { invoke } from "@tauri-apps/api/core";
import type { AccountMeta, CodeSet, ImportSummary } from "./types";

export const api = {
  listAccounts: () => invoke<AccountMeta[]>("list_accounts"),
  getCodes: () => invoke<CodeSet[]>("get_codes"),
  importLines: (content: string) => invoke<ImportSummary>("import_lines", { content }),
  deleteAccount: (id: string) => invoke<boolean>("delete_account", { id }),
  copyText: (text: string) => invoke<void>("copy_to_clipboard", { text }),
};
