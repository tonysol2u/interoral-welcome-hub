import { ArrowDownToLine, Coins, Send, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { usePageMeta } from "@/hooks/usePageMeta";
import { cn } from "@/lib/utils";

const MASTERCOIN_RATE_USD = 1.12;
const MASTERCOIN_BALANCE = 0;

const conversionRails = [
  {
    code: "USD",
    label: "United States",
    value: "$0.00",
    gradient: "from-sky-500 via-blue-500 to-indigo-600",
    glow: "shadow-sky-500/20",
  },
  {
    code: "INR",
    label: "India",
    value: "₹0.00",
    gradient: "from-orange-400 via-rose-500 to-fuchsia-600",
    glow: "shadow-rose-500/20",
  },
  {
    code: "EUR",
    label: "Eurozone",
    value: "€0.00",
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    glow: "shadow-emerald-500/20",
  },
];

const utilityCards = [
  {
    index: "01",
    category: "Automation",
    title: "AI Design Sessions",
    description: "Automated crown, bridge, and restoration design powered by the MasterCrown AI engine.",
    unit: "Per session",
    cost: "5 MC",
  },
  {
    index: "02",
    category: "Manufacturing",
    title: "STL Manufacturing Exports",
    description: "Export production-ready STL files for in-house mills, 3D printers, and fabrication partners.",
    unit: "Per export",
    cost: "2 MC",
  },
  {
    index: "03",
    category: "Human Network",
    title: "Designer Network Access",
    description: "Request human-in-the-loop review from certified designers in the Interoral Clubhouse network.",
    unit: "Per review",
    cost: "15 MC",
  },
];

function MasterCoinLogo() {
  return (
    <div className="flex items-center gap-3" aria-label="MasterCoin Digital Asset Treasury">
      <svg className="size-10 shrink-0" viewBox="0 0 48 48" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="mastercoin-gold" x1="7" x2="42" y1="6" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff4a8" />
            <stop offset="0.42" stopColor="#f3c14f" />
            <stop offset="1" stopColor="#9f6b12" />
          </linearGradient>
          <linearGradient id="mastercoin-blue" x1="14" x2="36" y1="12" y2="39" gradientUnits="userSpaceOnUse">
            <stop stopColor="#183a8f" />
            <stop offset="1" stopColor="#071a44" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill="url(#mastercoin-gold)" />
        <circle cx="24" cy="24" r="17" fill="url(#mastercoin-blue)" opacity="0.96" />
        <path
          d="M14 31V17h4.1l5.9 7.4 5.9-7.4H34v14h-4.2v-7.7l-5.2 6.3h-1.2l-5.2-6.3V31H14Z"
          fill="#f9dc7a"
        />
        <path d="M12 36h24" stroke="#fff1a5" strokeLinecap="round" strokeWidth="2" opacity="0.7" />
      </svg>
      <div className="leading-tight">
        <p className="font-serif text-lg font-bold tracking-tight text-slate-950">MasterCoin</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-slate-500">Digital Asset Treasury</p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-3 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

export default function MasterCoinLedgerPage() {
  const { user, isLoading } = useAuth();
  const sessionLabel = isLoading ? "Checking session" : user ? "Session active" : "No session";
  const accountEmail = user?.email ?? "-";
  const accountId = user?.id ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}` : "-";

  usePageMeta(
    "MasterCoin Digital Ledger | Interoral",
    "A member portal for MasterCoin balance, utility, and currency conversion previews.",
  );

  return (
    <main className="min-h-screen bg-[#f3f6f9] text-slate-950">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-5 py-8 sm:px-8 lg:px-12">
        <header className="border-b border-slate-200 pb-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <MasterCoinLogo />
            <Badge
              variant="outline"
              className={cn(
                "gap-2 rounded-full border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.26em]",
                user ? "text-emerald-700" : "text-amber-700",
              )}
            >
              <span className={cn("size-2 rounded-full", user ? "bg-emerald-500" : "bg-amber-500")} />
              {sessionLabel}
            </Badge>
          </div>
        </header>

        <section className="max-w-4xl">
          <p className="mb-4 text-xs font-black uppercase tracking-[0.34em] text-blue-700">
            Global Token Exchange - Member Portal
          </p>
          <h1 className="font-serif text-5xl font-bold leading-none tracking-tight text-[#101f3f] sm:text-6xl lg:text-7xl">
            MasterCoin Digital Ledger
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
            A sovereign settlement layer for digital dental assets. Hold, exchange, and spend MasterCoin
            across the Interoral Clubhouse, MasterCrown design engine, and Real-Time Designer Network -
            settled in real time against the global treasury.
          </p>
        </section>

        <section className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden rounded-none border-slate-200 bg-white">
            <CardContent className="flex flex-col gap-8 p-6 sm:p-9">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#173a8c] via-[#102d73] to-[#64748b] p-8 text-white shadow-2xl shadow-blue-950/20">
                <div className="absolute inset-y-0 left-[46%] w-1/2 skew-x-[-15deg] bg-white/10" />
                <div className="relative z-10 flex min-h-72 flex-col justify-between">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.36em] text-blue-100/70">
                        MasterCoin Reserve - Member Card
                      </p>
                      <h2 className="mt-3 font-serif text-2xl font-bold">Digital Asset Card</h2>
                      <p className="text-[11px] font-black uppercase tracking-[0.26em] text-blue-100/80">
                        Total token balance
                      </p>
                    </div>
                    <div className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-yellow-200 to-amber-600 font-serif text-xl font-bold text-[#10204a] shadow-lg">
                      M
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="font-serif text-4xl font-bold">{MASTERCOIN_BALANCE} MC</p>
                      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.26em] text-blue-100/70">
                        Account holder
                      </p>
                      <p className="mt-2 max-w-xs truncate text-sm font-semibold text-white/85">{accountEmail}</p>
                    </div>
                    <div className="self-end text-left sm:text-right">
                      <p className="text-[11px] font-black tracking-[0.2em] text-blue-100/60">Account Status</p>
                      <p className="mt-1 text-sm font-black uppercase tracking-[0.2em] text-yellow-200">
                        Active
                      </p>
                    </div>
                  </div>

                  <p className="text-[11px] font-black tracking-[0.35em] text-white/45">**** **** **** 0000</p>
                </div>
              </div>

              <div>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-2xl font-bold text-[#101f3f]">Currency Conversion</h2>
                    <p className="text-sm text-slate-500">Preview equivalent value across treasury rails.</p>
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">
                    Current rate - 1 MC = ${MASTERCOIN_RATE_USD.toFixed(2)} USD
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {conversionRails.map((rail) => (
                    <div
                      key={rail.code}
                      className={cn(
                        "overflow-hidden rounded-xl bg-gradient-to-br p-[1px] shadow-lg",
                        rail.gradient,
                        rail.glow,
                      )}
                    >
                      <div className="flex min-h-32 flex-col justify-between rounded-[11px] bg-white/[0.92] p-5">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">
                            {rail.code}
                          </p>
                          <p className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                            {rail.label}
                          </p>
                        </div>
                        <p className="font-serif text-2xl font-bold text-slate-950">{rail.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-7">
            <Card className="rounded-none border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="font-serif text-xl text-[#101f3f]">Account</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Email" value={accountEmail} />
                <DetailRow label="Account ID" value={accountId} />
                <DetailRow label="Currency" value="MasterCoin (MC)" />
                <DetailRow label="Network" value="Interoral L1" />
              </CardContent>
            </Card>

            <Card className="rounded-none border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="font-serif text-xl text-[#101f3f]">Treasury Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button className="rounded-sm bg-blue-700 font-bold hover:bg-blue-800">
                    <Coins data-icon="inline-start" />
                    Purchase MC
                  </Button>
                  <Button variant="outline" className="rounded-sm border border-blue-700 bg-white font-bold text-blue-700">
                    <Send data-icon="inline-start" />
                    Spend
                  </Button>
                </div>
                <Button variant="outline" className="rounded-sm border border-blue-700 bg-white font-bold text-blue-700">
                  <ArrowDownToLine data-icon="inline-start" />
                  Download Statement
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div>
            <h2 className="font-serif text-4xl font-bold tracking-tight text-[#101f3f]">
              Token Utility - Where MasterCoin Spends
            </h2>
            <p className="mt-2 text-slate-600">Three settlement rails for the global dental design economy.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {utilityCards.map((card) => (
              <Card key={card.index} className="rounded-none border-slate-200 bg-white">
                <CardHeader>
                  <p className="text-[11px] font-black tracking-[0.24em] text-blue-600">
                    {card.index} / {card.category}
                  </p>
                  <CardTitle className="font-serif text-2xl text-[#101f3f]">{card.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <p className="min-h-20 text-sm leading-6 text-slate-600">{card.description}</p>
                  <Separator />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{card.unit}</span>
                    <span className="font-serif text-xl font-bold text-[#101f3f]">{card.cost}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-slate-200 pt-7 text-xs leading-5 text-slate-400 sm:flex-row sm:items-start">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            MasterCoin is an internal utility token of the Interoral ecosystem. Balances are de-identified
            and settled in real time against the global treasury. Currency conversions are indicative only
            and do not constitute a guarantee of redeemable value.
          </p>
        </footer>
      </section>
    </main>
  );
}
