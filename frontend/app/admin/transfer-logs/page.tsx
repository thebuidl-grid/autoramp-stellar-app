import { redirect } from "next/navigation";

/** Transfer Logs is now a tab of Transactions. Old links and bookmarks land there. */
export default function AdminTransferLogsRedirect() {
  redirect("/admin/transactions?tab=transfer-logs");
}
