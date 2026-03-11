import { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { getSpendNonce, getSpendRecord } from "../lib/contracts";
import { Activity as ActivityIcon, ArrowUpRight } from "lucide-react";

interface SpendRecord {
  nonce: number;
  agent: string;
  service: string;
  amount: number;
  block: number;
}

export default function Activity() {
  const { address } = useWallet();
  const [records, setRecords] = useState<SpendRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    loadRecords();
  }, [address]);

  async function loadRecords() {
    try {
      const nonceResult = await getSpendNonce(address!);
      console.log("[Activity] spend-nonce result:", JSON.stringify(nonceResult));

      // getSpendNonce returns uint directly (not optional)
      const nonce = parseInt(nonceResult.value);
      console.log("[Activity] Parsed nonce:", nonce);

      if (!nonce || nonce === 0) {
        console.log("[Activity] No spending records (nonce = 0)");
        setRecords([]);
        setLoading(false);
        return;
      }

      const loaded: SpendRecord[] = [];

      const start = Math.max(0, nonce - 50);
      for (let i = start; i < nonce; i++) {
        try {
          const record = await getSpendRecord(address!, i);
          console.log(`[Activity] Record ${i}:`, JSON.stringify(record));

          // cvToJSON for map-get? returns double-nested:
          // { value: { value: { agent: {...}, service: {...}, ... } } }
          if (record && record.value && record.value.value) {
            const v = record.value.value;
            loaded.push({
              nonce: i,
              agent: v.agent.value,
              service: v.service.value,
              amount: parseInt(v.amount.value),
              block: parseInt(v.block.value),
            });
          }
        } catch (err) {
          console.error(`[Activity] Error loading record ${i}:`, err);
          continue;
        }
      }
      setRecords(loaded);
    } catch (err) {
      console.error("[Activity] Error loading records:", err);
      setRecords([]);
    }
    setLoading(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Activity</h1>
      <p className="text-text-muted text-sm mb-8">
        On-chain spending history for your agent wallet
      </p>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <ActivityIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No spending activity yet.</p>
          <p className="text-xs mt-1">
            Transactions will appear here when your agent makes payments.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs text-text-muted font-medium">
            <div className="col-span-1">#</div>
            <div className="col-span-3">Service</div>
            <div className="col-span-3">Agent</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-2 text-right">Block</div>
            <div className="col-span-1" />
          </div>

          {records.map((r, idx) => (
            <div
              key={r.nonce}
              className="grid grid-cols-12 gap-4 items-center px-4 py-3 rounded-lg bg-surface border border-border hover:border-border-hover transition-colors"
            >
              <div className="col-span-1 text-sm text-text-muted font-mono">
                {idx + 1}
              </div>
              <div className="col-span-3 text-sm font-mono truncate">
                {r.service}
              </div>
              <div className="col-span-3 text-sm font-mono truncate text-text-muted">
                {r.agent}
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-medium">
                  {(r.amount / 1_000_000).toFixed(4)}
                </span>
                <span className="text-xs text-text-muted ml-1">STX</span>
              </div>
              <div className="col-span-2 text-right text-sm text-text-muted font-mono">
                #{r.block}
              </div>
              <div className="col-span-1 text-right">
                <ArrowUpRight className="w-4 h-4 text-accent inline" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
