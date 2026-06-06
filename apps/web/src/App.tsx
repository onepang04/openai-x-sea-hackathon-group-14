import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  ImageIcon,
  LockKeyhole,
  Mail,
  Package,
  Search,
  ShieldCheck,
  Store,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import {
  applyQueueControls,
  getDefaultClaimId,
  queueFilters,
  queueSorts,
  type QueueFilter,
  type QueueSort,
} from "./lib/queue";
import type {
  ClaimVerdictView,
  EvidenceImage,
  RecommendedAction,
  RiskBand,
  SellerSession,
  SignalName,
  SignalView,
  WorkflowState,
} from "./types";
import { loadClaimVerdicts } from "./model/claimVerdicts";
import { mockVerdicts } from "./data/mockVerdicts";

const DEMO_SELLER_EMAIL = "seller@demo.local";

const actionToWorkflow: Record<RecommendedAction, WorkflowState> = {
  Release: "Released",
  "Request evidence": "Evidence requested",
  Escalate: "Escalated",
};

type AppScreen = "landing" | "login" | "dashboard";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; source: "api" | "demo" }
  | { status: "error"; message: string };

function App() {
  const [screen, setScreen] = useState<AppScreen>("landing");
  const [sellerSession, setSellerSession] = useState<SellerSession | null>(null);
  const [verdicts, setVerdicts] = useState<ClaimVerdictView[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("All");
  const [sort, setSort] = useState<QueueSort>("Risk Score");
  const [selectedId, setSelectedId] = useState("");
  const [workflowByClaim, setWorkflowByClaim] = useState<Record<string, WorkflowState>>({});
  const [notesByClaim, setNotesByClaim] = useState<Record<string, string>>({});
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageMode, setImageMode] = useState<"fit" | "fill">("fit");
  const [expandedSignal, setExpandedSignal] = useState<SignalName | null>("VisualClaimIntegrity");

  useEffect(() => {
    if (screen !== "dashboard" || !sellerSession || verdicts.length > 0 || loadState.status !== "idle") {
      return;
    }

    let isCancelled = false;

    setLoadState({ status: "loading" });

    loadClaimVerdicts()
      .then((loadedVerdicts) => {
        if (isCancelled) {
          return;
        }

        setVerdicts(loadedVerdicts);
        setWorkflowByClaim(
          Object.fromEntries(loadedVerdicts.map((verdict) => [verdict.claim.id, verdict.claim.workflowState])),
        );
        setSelectedId(getDefaultClaimId(loadedVerdicts));
        setLoadState({ status: "ready", source: "api" });
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        setLoadState({ status: "error", message: error instanceof Error ? error.message : "Unknown API error" });
      });

    return () => {
      isCancelled = true;
    };
  }, [loadState.status, screen, sellerSession, verdicts.length]);

  const queueItems = useMemo(
    () => applyQueueControls(verdicts, workflowByClaim, query, filter, sort),
    [filter, query, sort, verdicts, workflowByClaim],
  );

  useEffect(() => {
    if (queueItems.length > 0 && !queueItems.some((verdict) => verdict.claim.id === selectedId)) {
      setSelectedId(queueItems[0].claim.id);
    }
  }, [queueItems, selectedId]);

  useEffect(() => {
    setActiveImageIndex(0);
    setExpandedSignal("VisualClaimIntegrity");
  }, [selectedId]);

  const selectedVerdict =
    queueItems.find((verdict) => verdict.claim.id === selectedId) ??
    verdicts.find((verdict) => verdict.claim.id === selectedId) ??
    queueItems[0] ??
    verdicts[0];

  const selectedWithWorkflow = selectedVerdict
    ? {
        ...selectedVerdict,
        claim: {
          ...selectedVerdict.claim,
          workflowState: workflowByClaim[selectedVerdict.claim.id] ?? selectedVerdict.claim.workflowState,
        },
      }
    : null;

  const metrics = useMemo(() => {
    const withWorkflow = verdicts.map((verdict) => ({
      ...verdict,
      claim: {
        ...verdict.claim,
        workflowState: workflowByClaim[verdict.claim.id] ?? verdict.claim.workflowState,
      },
    }));

    return {
      open: withWorkflow.filter((verdict) => verdict.claim.workflowState === "Unreviewed").length,
      high: withWorkflow.filter((verdict) => verdict.band === "High").length,
      elevated: withWorkflow.filter((verdict) => verdict.band === "Elevated").length,
      needsReview: withWorkflow.filter(
        (verdict) => verdict.claim.workflowState === "Unreviewed" && verdict.recommendedAction !== "Release",
      ).length,
    };
  }, [verdicts, workflowByClaim]);

  function setAction(action: RecommendedAction) {
    if (!selectedWithWorkflow) {
      return;
    }

    setWorkflowByClaim((current) => ({
      ...current,
      [selectedWithWorkflow.claim.id]: actionToWorkflow[action],
    }));
  }

  function applyVerdicts(loadedVerdicts: ClaimVerdictView[]) {
    setVerdicts(loadedVerdicts);
    setWorkflowByClaim(
      Object.fromEntries(loadedVerdicts.map((verdict) => [verdict.claim.id, verdict.claim.workflowState])),
    );
    setSelectedId(getDefaultClaimId(loadedVerdicts));
    setActiveImageIndex(0);
    setExpandedSignal("VisualClaimIntegrity");
  }

  function clearVerdicts() {
    setVerdicts([]);
    setWorkflowByClaim({});
    setSelectedId("");
    setNotesByClaim({});
    setActiveImageIndex(0);
    setExpandedSignal("VisualClaimIntegrity");
  }

  function handleEngineLogin(email: string) {
    clearVerdicts();
    setSellerSession({
      id: "seller-demo",
      displayName: "Demo Seller",
      shopName: "Northstar Devices",
      email,
    });
    setLoadState({ status: "idle" });
    setScreen("dashboard");
  }

  function handleDemoLogin() {
    applyVerdicts(mockVerdicts);
    setSellerSession({
      id: "seller-demo",
      displayName: "Demo Seller",
      shopName: "Northstar Devices",
      email: DEMO_SELLER_EMAIL,
    });
    setLoadState({ status: "ready", source: "demo" });
    setScreen("dashboard");
  }

  function handleSignOut() {
    setSellerSession(null);
    setScreen("landing");
  }

  if (screen === "landing") {
    return <LandingPage onStart={() => setScreen("login")} />;
  }

  if (screen === "login" || !sellerSession) {
    return (
      <LoginScreen
        onBack={() => setScreen("landing")}
        onDemoLogin={handleDemoLogin}
        onEngineLogin={handleEngineLogin}
      />
    );
  }

  return (
    <div className="app-shell min-h-screen bg-ink-950 text-zinc-100">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <Header loadState={loadState} sellerSession={sellerSession} onSignOut={handleSignOut} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Open claims" value={metrics.open} icon={<FileText aria-hidden="true" />} />
          <Metric label="High risk" value={metrics.high} tone="high" icon={<AlertTriangle aria-hidden="true" />} />
          <Metric label="Elevated" value={metrics.elevated} tone="elevated" icon={<Eye aria-hidden="true" />} />
          <Metric label="Needs review" value={metrics.needsReview} icon={<ShieldCheck aria-hidden="true" />} />
        </section>

        {loadState.status === "ready" && selectedWithWorkflow ? (
          <main className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
            <QueuePanel
              filter={filter}
              query={query}
              queueItems={queueItems}
              selectedId={selectedWithWorkflow.claim.id}
              sort={sort}
              onFilterChange={setFilter}
              onQueryChange={setQuery}
              onSelect={setSelectedId}
              onSortChange={setSort}
            />

            <VerdictPanel
              activeImageIndex={activeImageIndex}
              expandedSignal={expandedSignal}
              imageMode={imageMode}
              note={notesByClaim[selectedWithWorkflow.claim.id] ?? ""}
              verdict={selectedWithWorkflow}
              onAction={setAction}
              onExpandedSignalChange={setExpandedSignal}
              onImageIndexChange={setActiveImageIndex}
              onImageModeChange={setImageMode}
              onNoteChange={(note) =>
                setNotesByClaim((current) => ({
                  ...current,
                  [selectedWithWorkflow.claim.id]: note,
                }))
              }
            />
          </main>
        ) : (
          <StatusPanel loadState={loadState} />
        )}
      </div>
    </div>
  );
}

function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="app-shell min-h-screen bg-ink-950 text-zinc-100">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Claim Integrity</p>
              <p className="text-xs text-zinc-500">Seller verification</p>
            </div>
          </div>

          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition-colors duration-150 ease-out-strong hoverable:hover:border-zinc-600 active:scale-[0.97]"
            type="button"
            onClick={onStart}
          >
            Seller login
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <main className="flex flex-1 flex-col">
          <section className="landing-hero relative grid min-h-[82svh] items-center overflow-hidden py-14">
            <div className="landing-scene" aria-hidden="true">
              <div className="landing-board landing-board--main">
                <div className="landing-board__top">
                  <span>Risk Score</span>
                  <strong>91</strong>
                </div>
                <div className="landing-board__meter">
                  <span />
                </div>
                <div className="landing-board__rows">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="landing-board landing-board--queue">
                <div className="landing-queue-row landing-queue-row--hot" />
                <div className="landing-queue-row landing-queue-row--warn" />
                <div className="landing-queue-row landing-queue-row--ok" />
              </div>
              <div className="landing-signal-strip">
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className="relative max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.45)]" />
                Live demo
              </div>
              <h1 className="mt-6 max-w-2xl text-5xl font-semibold leading-[0.98] tracking-normal text-white sm:text-6xl lg:text-7xl">
                Claim Integrity
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
                Seller-facing triage for webhook-fed refund claims, with Risk Score, signal evidence,
                and advisory actions in one operational queue.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-zinc-100 bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-150 ease-out-strong active:scale-[0.97]"
                  type="button"
                  onClick={onStart}
                >
                  Start seller workflow
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <div className="inline-flex min-h-12 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-400">
                  <ShieldCheck className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                  No production auth in this demo
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 pb-6 md:grid-cols-3">
            <LandingStep icon={<Store aria-hidden="true" />} label="Seller" value="Signs in with demo access" />
            <LandingStep icon={<FileText aria-hidden="true" />} label="Claims" value="Loads seeded webhook-fed records" />
            <LandingStep icon={<ShieldCheck aria-hidden="true" />} label="Triage" value="Reviews evidence and records action" />
          </section>
        </main>
      </div>
    </div>
  );
}

function LandingStep({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <span className="flex h-4 w-4 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-200">{value}</p>
    </div>
  );
}

function LoginScreen({
  onBack,
  onDemoLogin,
  onEngineLogin,
}: {
  onBack: () => void;
  onDemoLogin: () => void;
  onEngineLogin: (email: string) => void;
}) {
  const [email, setEmail] = useState(DEMO_SELLER_EMAIL);
  const [error, setError] = useState("");

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.includes("@")) {
      setError("Enter a seller email to continue.");
      return;
    }

    setError("");
    onEngineLogin(normalizedEmail);
  }

  return (
    <div className="app-shell min-h-screen bg-ink-950 text-zinc-100">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm font-semibold text-zinc-300 transition-colors duration-150 ease-out-strong hoverable:hover:border-zinc-600 active:scale-[0.97]"
            type="button"
            onClick={onBack}
          >
            Claim Integrity
          </button>
          <div className="hidden items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-400 sm:flex">
            <LockKeyhole className="h-4 w-4 text-zinc-500" aria-hidden="true" />
            Demo access
          </div>
        </header>

        <main className="grid flex-1 place-items-center py-10">
          <section className="login-panel grid w-full max-w-5xl overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/90 md:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)]">
            <div className="hidden border-r border-zinc-800 bg-ink-900 p-6 md:block">
              <div className="flex h-full flex-col justify-between gap-10">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h1 className="mt-6 text-3xl font-semibold leading-tight text-white">Seller workspace</h1>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    The live-demo path uses a local seller session and leaves production authentication out of scope.
                  </p>
                </div>

                <div className="space-y-3">
                  {["Dashboard gated by login", "Actions remain seller-driven", "Claims come from seeded JSON"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                      <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <form className="p-5 sm:p-7" onSubmit={submitLogin}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100">
                  <Store className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Seller login</h2>
                  <p className="text-sm text-zinc-500">Northstar Devices demo account</p>
                </div>
              </div>

              <label className="mt-8 block">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Email</span>
                <span className="mt-2 flex min-h-12 items-center gap-2 rounded-lg border border-zinc-800 bg-ink-900 px-3 py-2 text-sm text-zinc-300 focus-within:border-zinc-500">
                  <Mail className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                    inputMode="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </span>
              </label>

              {error ? (
                <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  {error}
                </p>
              ) : null}

              <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-zinc-100 bg-zinc-100 px-5 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-150 ease-out-strong active:scale-[0.97]"
                  type="submit"
                >
                  Continue with login
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-300 transition-colors duration-150 ease-out-strong hoverable:hover:border-zinc-600 active:scale-[0.97]"
                  type="button"
                  onClick={onDemoLogin}
                >
                  Seller demo
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}

function Header({
  loadState,
  onSignOut,
  sellerSession,
}: {
  loadState: LoadState;
  onSignOut: () => void;
  sellerSession: SellerSession;
}) {
  const statusLabel =
    loadState.status === "ready"
      ? loadState.source === "api"
        ? "Live JSON data"
        : "Seller demo data"
      : loadState.status === "loading"
        ? "Loading claims"
        : loadState.status === "error"
          ? "API unavailable"
          : "Preparing dashboard";

  return (
    <header className="flex flex-col gap-3 border-b border-zinc-800/80 pb-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-normal text-white">Claim Integrity</h1>
          <p className="text-sm text-zinc-500">Seller verification queue</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-400">
          <Store className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <span className="max-w-[180px] truncate">{sellerSession.shopName}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-400">
          <span
            className={cx(
              "h-2 w-2 rounded-full",
              loadState.status === "error"
                ? "bg-red-400 shadow-[0_0_16px_rgba(248,113,113,0.45)]"
                : loadState.status === "loading"
                  ? "bg-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.35)]"
                  : "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.45)]",
            )}
          />
          {statusLabel}
        </div>
        <button
          className="min-h-10 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-sm font-semibold text-zinc-300 transition-colors duration-150 ease-out-strong hoverable:hover:border-zinc-600 active:scale-[0.97]"
          type="button"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

function StatusPanel({ loadState }: { loadState: LoadState }) {
  return (
    <main className="grid flex-1 place-items-center rounded-lg border border-zinc-800 bg-zinc-950/80 p-6">
      <div className="max-w-lg text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-ink-900 text-zinc-400">
          {loadState.status === "error" ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <FileText className="h-5 w-5" aria-hidden="true" />}
        </div>
        <h2 className="mt-4 text-base font-semibold text-white">
          {loadState.status === "error" ? "Unable to load claims" : "Loading claim data"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {loadState.status === "error"
            ? loadState.message
            : "Connecting to the claim API and loading the final JSON dataset."}
        </p>
      </div>
    </main>
  );
}

function Metric({
  icon,
  label,
  tone = "neutral",
  value,
}: {
  icon: ReactNode;
  label: string;
  tone?: "neutral" | "high" | "elevated";
  value: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
        <span className={cx("flex h-8 w-8 items-center justify-center rounded-md", metricToneClass(tone))}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none text-white">{value}</p>
    </div>
  );
}

function QueuePanel({
  filter,
  onFilterChange,
  onQueryChange,
  onSelect,
  onSortChange,
  query,
  queueItems,
  selectedId,
  sort,
}: {
  filter: QueueFilter;
  onFilterChange: (filter: QueueFilter) => void;
  onQueryChange: (query: string) => void;
  onSelect: (claimId: string) => void;
  onSortChange: (sort: QueueSort) => void;
  query: string;
  queueItems: ClaimVerdictView[];
  selectedId: string;
  sort: QueueSort;
}) {
  const activeFilterIndex = queueFilters.indexOf(filter);
  const [isSortOpen, setIsSortOpen] = useState(false);

  return (
    <aside className="min-h-0 rounded-lg border border-zinc-800 bg-zinc-950/80">
      <div className="border-b border-zinc-800 p-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Claims</h2>
          <p className="text-xs text-zinc-500">{queueItems.length} visible scenarios</p>
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-800 bg-ink-900 px-3 py-2 text-sm text-zinc-300 focus-within:border-zinc-500">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <span className="sr-only">Search claims</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            placeholder="Search claim, product, buyer"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        <div
          className="filter-control mt-3"
          style={{ "--filter-index": activeFilterIndex } as CSSProperties}
        >
          <span className="filter-control__thumb" aria-hidden="true" />
          {queueFilters.map((item) => (
            <button
              key={item}
              aria-pressed={item === filter}
              className="filter-control__item"
              data-active={item === filter}
              type="button"
              onClick={() => onFilterChange(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div
          className="sort-control mt-3"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsSortOpen(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsSortOpen(false);
            }
          }}
        >
          <div className="sort-control__meta">
            <span className="sort-control__label">
              <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
              Sort
            </span>
            <span>Queue order</span>
          </div>
          <button
            aria-expanded={isSortOpen}
            aria-haspopup="listbox"
            className="sort-control__trigger"
            type="button"
            onClick={() => setIsSortOpen((current) => !current)}
          >
            <span>{sort}</span>
            <ChevronDown className="sort-control__chevron" data-open={isSortOpen} aria-hidden="true" />
          </button>
          <div className="sort-control__menu" data-open={isSortOpen} role="listbox" aria-label="Sort claims">
            {queueSorts.map((item) => (
              <button
                key={item}
                aria-selected={item === sort}
                className="sort-control__option"
                data-active={item === sort}
                role="option"
                type="button"
                onClick={() => {
                  onSortChange(item);
                  setIsSortOpen(false);
                }}
              >
                <span>{item}</span>
                {item === sort ? <span className="sort-control__check" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-h-[calc(100vh-330px)] min-h-[420px] overflow-y-auto p-2">
        {queueItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            No claims match the current queue controls.
          </div>
        ) : (
          queueItems.map((verdict) => (
            <QueueRow
              key={verdict.claim.id}
              isSelected={verdict.claim.id === selectedId}
              verdict={verdict}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function QueueRow({
  isSelected,
  onSelect,
  verdict,
}: {
  isSelected: boolean;
  onSelect: (claimId: string) => void;
  verdict: ClaimVerdictView;
}) {
  return (
    <button
      className={cx(
        "queue-row mb-2 w-full rounded-lg border p-3 text-left transition-colors duration-150 ease-out-strong active:scale-[0.995]",
        isSelected
          ? "border-zinc-500 bg-zinc-900"
          : "border-zinc-800 bg-zinc-950 hoverable:hover:border-zinc-700 hoverable:hover:bg-zinc-900/80",
      )}
      type="button"
      onClick={() => onSelect(verdict.claim.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{verdict.claim.id}</span>
            <BandBadge band={verdict.band} />
          </div>
          <p className="mt-2 truncate text-sm font-medium text-zinc-200">{verdict.claim.product}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">{verdict.claim.reason}</p>
        </div>
        <div className="text-right">
          <p className={cx("text-2xl font-semibold leading-none", riskTextClass(verdict.band))}>
            {verdict.riskScore}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-zinc-600">Risk Score</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span className="flex min-w-0 items-center gap-1">
          <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{verdict.claim.buyer}</span>
        </span>
        <WorkflowBadge state={verdict.claim.workflowState} />
      </div>
    </button>
  );
}

function VerdictPanel({
  activeImageIndex,
  expandedSignal,
  imageMode,
  note,
  onAction,
  onExpandedSignalChange,
  onImageIndexChange,
  onImageModeChange,
  onNoteChange,
  verdict,
}: {
  activeImageIndex: number;
  expandedSignal: SignalName | null;
  imageMode: "fit" | "fill";
  note: string;
  onAction: (action: RecommendedAction) => void;
  onExpandedSignalChange: (signal: SignalName | null) => void;
  onImageIndexChange: (index: number) => void;
  onImageModeChange: (mode: "fit" | "fill") => void;
  onNoteChange: (note: string) => void;
  verdict: ClaimVerdictView;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/80">
      <div className="grid gap-5 border-b border-zinc-800 p-4 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-400">
              {verdict.claim.id}
            </span>
            <BandBadge band={verdict.band} />
            {verdict.hardFlags.length > 0 ? <HardFlagBadge /> : null}
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-normal text-white">{verdict.claim.product}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{verdict.claim.claimText}</p>

          <div className="mt-4 grid gap-3 text-sm text-zinc-400 sm:grid-cols-3">
            <InfoItem icon={<User aria-hidden="true" />} label="Buyer" value={verdict.claim.buyer} />
            <InfoItem icon={<Clock3 aria-hidden="true" />} label="Delivered" value={formatDate(verdict.claim.submittedAt)} />
            <InfoItem icon={<Package aria-hidden="true" />} label="Claim value" value={formatCurrency(verdict.claim.claimValue)} />
          </div>
        </div>

        <RiskSummary verdict={verdict} />
      </div>

      <div className="grid gap-5 p-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.05fr)]">
        <div className="min-w-0 space-y-5">
          <EvidenceViewer
            activeIndex={activeImageIndex}
            images={verdict.claim.evidenceImages}
            mode={imageMode}
            onActiveIndexChange={onImageIndexChange}
            onModeChange={onImageModeChange}
          />

          <div className="rounded-lg border border-zinc-800 bg-ink-900 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileText className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              Product context
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{verdict.claim.productDetails}</p>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <SignalsPanel
            expandedSignal={expandedSignal}
            signals={verdict.signals}
            onExpandedSignalChange={onExpandedSignalChange}
          />

          <section className="rounded-lg border border-zinc-800 bg-ink-900 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              Seller explanation
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{verdict.explanation}</p>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-ink-900 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Workflow</h3>
                <div className="mt-2 flex items-center gap-2">
                  <WorkflowBadge state={verdict.claim.workflowState} />
                  <span className="text-xs text-zinc-500">Recommended: {verdict.recommendedAction}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["Release", "Request evidence", "Escalate"] as RecommendedAction[]).map((action) => (
                  <button
                    key={action}
                    className={cx(
                      "min-h-10 rounded-md border px-3 py-2 text-xs font-semibold transition-colors duration-150 ease-out-strong active:scale-[0.97]",
                      actionButtonClass(action),
                    )}
                    type="button"
                    onClick={() => onAction(action)}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Override note</span>
              <textarea
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors duration-150 ease-out-strong placeholder:text-zinc-600 focus:border-zinc-500"
                placeholder="Add seller rationale"
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
              />
            </label>
          </section>
        </div>
      </div>
    </section>
  );
}

function RiskSummary({ verdict }: { verdict: ClaimVerdictView }) {
  return (
    <aside className="rounded-lg border border-zinc-800 bg-ink-900 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Risk Score</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className={cx("text-6xl font-semibold leading-none", riskTextClass(verdict.band))}>{verdict.riskScore}</p>
        <BandBadge band={verdict.band} size="lg" />
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cx("h-full rounded-full", riskBarClass(verdict.band))}
          style={{ width: `${verdict.riskScore}%` }}
        />
      </div>
      {typeof verdict.weightedScore === "number" ? (
        <p className="mt-3 text-xs text-zinc-500">Weighted score before overrides: {verdict.weightedScore}</p>
      ) : null}
      {verdict.hardFlags.length > 0 ? (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
          {verdict.hardFlags[0]}
        </div>
      ) : null}
    </aside>
  );
}

function EvidenceViewer({
  activeIndex,
  images,
  mode,
  onActiveIndexChange,
  onModeChange,
}: {
  activeIndex: number;
  images: EvidenceImage[];
  mode: "fit" | "fill";
  onActiveIndexChange: (index: number) => void;
  onModeChange: (mode: "fit" | "fill") => void;
}) {
  const activeImage = images[Math.min(activeIndex, images.length - 1)];
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  return (
    <section className="rounded-lg border border-zinc-800 bg-ink-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ImageIcon className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          Evidence
        </div>
        <div className="flex rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
          {(["fit", "fill"] as const).map((item) => (
            <button
              key={item}
              aria-pressed={mode === item}
              className={cx(
                "rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors duration-150 ease-out-strong active:scale-[0.98]",
                mode === item ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hoverable:hover:text-zinc-200",
              )}
              type="button"
              onClick={() => onModeChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        {!activeImage ? (
          <ImageFallback label="No evidence image returned for this claim." />
        ) : failedImages[activeImage.id] ? (
          <ImageFallback label={activeImage.alt} />
        ) : (
          <img
            key={activeImage.id}
            className={cx(
              "h-full w-full bg-zinc-950 opacity-100 transition-opacity duration-150 ease-out-strong",
              mode === "fit" ? "object-contain" : "object-cover",
            )}
            src={activeImage.url}
            alt={activeImage.alt}
            onError={() =>
              setFailedImages((current) => ({
                ...current,
                [activeImage.id]: true,
              }))
            }
          />
        )}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {images.map((image, index) => (
            <button
              key={image.id}
              className={cx(
                "aspect-[4/3] overflow-hidden rounded-md border bg-zinc-950 transition-colors duration-150 ease-out-strong active:scale-[0.98]",
                index === activeIndex ? "border-zinc-200" : "border-zinc-800 hoverable:hover:border-zinc-600",
              )}
              type="button"
              onClick={() => onActiveIndexChange(index)}
            >
              <img className="h-full w-full object-cover" src={image.url} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SignalsPanel({
  expandedSignal,
  onExpandedSignalChange,
  signals,
}: {
  expandedSignal: SignalName | null;
  onExpandedSignalChange: (signal: SignalName | null) => void;
  signals: SignalView[];
}) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-ink-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">Signals</h3>
        <span className="text-xs text-zinc-500">Weighted by confidence</span>
      </div>
      <div className="mt-4 space-y-2">
        {signals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 px-4 py-8 text-center text-sm text-zinc-500">
            No signal results returned yet.
          </div>
        ) : (
          signals.map((signal) => {
          const isExpanded = signal.name === expandedSignal;

          return (
            <div key={signal.name} className="rounded-lg border border-zinc-800 bg-zinc-950">
              <button
                className="w-full p-3 text-left transition-colors duration-150 ease-out-strong hoverable:hover:bg-zinc-900"
                type="button"
                onClick={() => onExpandedSignalChange(isExpanded ? null : signal.name)}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">{formatSignalName(signal.name)}</span>
                      {signal.hardFlagTrigger ? <HardFlagBadge compact /> : null}
                    </div>
                    <p className="mt-2 text-sm leading-5 text-zinc-400">{signal.evidence}</p>
                  </div>
                  <div className="grid min-w-[170px] grid-cols-2 gap-2 text-right">
                    <SignalStat label="Risk" value={`${Math.round(signal.risk * 100)}%`} tone={signalTone(signal.risk)} />
                    <SignalStat
                      label={signal.confidenceLabel}
                      value={`${Math.round(signal.confidence * 100)}%`}
                      tone="neutral"
                    />
                  </div>
                </div>
              </button>

              <div
                className={cx(
                  "grid transition-[grid-template-rows,opacity] duration-150 ease-out-strong",
                  isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="overflow-hidden">
                  <SignalDetails signal={signal} />
                </div>
              </div>
            </div>
          );
        })
        )}
      </div>
    </section>
  );
}

function SignalDetails({ signal }: { signal: SignalView }) {
  const details = signal.details ?? {};

  if (signal.name === "VisualClaimIntegrity") {
    const contradictions = asStringList(details.contradictions);
    const alternatives = asStringList(details.alternativeExplanations);
    const mismatches = asStringList(details.mismatches);

    return (
      <div className="border-t border-zinc-800 p-3">
        <DetailGrid
          items={[
            ["Physical plausibility", asString(details.physicalPlausibility)],
            ["Text-image match", asBoolean(details.textImageMatch) ? "Matches" : "Mismatch"],
          ]}
        />
        <DetailSection title="Plausibility reasoning" lines={[asString(details.plausibilityReasoning)]} />
        <DetailSection title="Contradictions" lines={contradictions.length ? contradictions : ["None surfaced."]} />
        <DetailSection
          title="Alternative explanations"
          lines={alternatives.length ? alternatives : ["No strong innocent explanation surfaced."]}
        />
        {mismatches.length > 0 ? <DetailSection title="Mismatches" lines={mismatches} /> : null}
      </div>
    );
  }

  if (signal.name === "ImageReuse") {
    const matchedPriorEvidence = details.matchedPriorEvidence as EvidenceImage | undefined;

    return (
      <div className="border-t border-zinc-800 p-3">
        <DetailGrid
          items={[
            ["Match found", asBoolean(details.matchFound) ? "Yes" : "No"],
            ["pHash distance", asNumber(details.pHashDistance)],
            ["Matching claim", asString(details.matchingClaimId) || "None"],
          ]}
        />
        {signal.hardFlagTrigger ? <DetailSection title="Hard flag trigger" lines={[signal.hardFlagTrigger]} /> : null}
        {matchedPriorEvidence ? (
          <div className="mt-3 grid gap-3 rounded-lg border border-zinc-800 bg-ink-900 p-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <img
              className="aspect-[4/3] w-full rounded-md border border-zinc-800 object-cover"
              src={matchedPriorEvidence.url}
              alt={matchedPriorEvidence.alt}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Matched prior claim</p>
              <p className="mt-2 text-sm text-zinc-200">{asString(details.matchingClaimId)}</p>
              <p className="mt-1 text-sm text-zinc-500">pHash distance {asNumber(details.pHashDistance)}</p>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-800 p-3">
      <DetailGrid
        items={[
          ["Account age", `${asNumber(details.accountAgeDays)} days`],
          ["Claims last 30 days", asNumber(details.claimsLast30Days)],
          ["Refund rate", asString(details.refundRate)],
        ]}
      />
      <DetailSection title="Triggered rules" lines={asStringList(details.triggeredRules)} />
      {asString(details.override) ? (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-100">
          {asString(details.override)}
        </div>
      ) : null}
    </div>
  );
}

function DetailGrid({ items }: { items: [string, string | number][] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-zinc-800 bg-ink-900 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
          <p className="mt-1 truncate text-sm text-zinc-200">{String(value || "None")}</p>
        </div>
      ))}
    </div>
  );
}

function DetailSection({ lines, title }: { lines: string[]; title: string }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <div className="mt-2 space-y-2">
        {(lines.length ? lines : ["None surfaced."]).map((line) => (
          <p key={line} className="rounded-md border border-zinc-800 bg-ink-900 px-3 py-2 text-sm leading-6 text-zinc-300">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function SignalStat({ label, tone, value }: { label: string; tone: "low" | "medium" | "high" | "neutral"; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-ink-900 px-2 py-1.5">
      <p className={cx("text-sm font-semibold", signalToneClass(tone))}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-zinc-600">{label}</p>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-ink-900 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="flex h-3.5 w-3.5 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-medium text-zinc-200">{value}</p>
    </div>
  );
}

function BandBadge({ band, size = "sm" }: { band: RiskBand; size?: "sm" | "lg" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border font-semibold",
        size === "lg" ? "px-2.5 py-1.5 text-sm" : "px-2 py-1 text-xs",
        bandBadgeClass(band),
      )}
    >
      {band}
    </span>
  );
}

function WorkflowBadge({ state }: { state: WorkflowState }) {
  return (
    <span className={cx("inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium", workflowClass(state))}>
      {state}
    </span>
  );
}

function HardFlagBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 font-semibold text-red-100",
        compact ? "px-2 py-1 text-[11px]" : "px-2 py-1 text-xs",
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      Hard flag applied
    </span>
  );
}

function ImageFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,#111,#1d1d1d)] px-6 text-center">
      <ImageIcon className="h-8 w-8 text-zinc-600" aria-hidden="true" />
      <p className="max-w-sm text-sm text-zinc-500">{label}</p>
    </div>
  );
}

function formatSignalName(name: SignalName): string {
  if (name === "VisualClaimIntegrity") {
    return "Visual Claim Integrity";
  }
  if (name === "ImageReuse") {
    return "Image Reuse";
  }
  return "Behavioural Context";
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function signalTone(value: number): "low" | "medium" | "high" {
  if (value > 0.65) {
    return "high";
  }
  if (value >= 0.3) {
    return "medium";
  }
  return "low";
}

function metricToneClass(tone: "neutral" | "high" | "elevated"): string {
  if (tone === "high") {
    return "border border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (tone === "elevated") {
    return "border border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  return "border border-zinc-800 bg-zinc-900 text-zinc-300";
}

function bandBadgeClass(band: RiskBand): string {
  if (band === "High") {
    return "border-red-500/30 bg-red-500/10 text-red-100";
  }
  if (band === "Elevated") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
}

function riskTextClass(band: RiskBand): string {
  if (band === "High") {
    return "text-red-300";
  }
  if (band === "Elevated") {
    return "text-amber-300";
  }
  return "text-emerald-300";
}

function riskBarClass(band: RiskBand): string {
  if (band === "High") {
    return "bg-red-400";
  }
  if (band === "Elevated") {
    return "bg-amber-400";
  }
  return "bg-emerald-400";
}

function workflowClass(state: WorkflowState): string {
  if (state === "Released") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  }
  if (state === "Evidence requested") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  if (state === "Escalated") {
    return "border-red-500/30 bg-red-500/10 text-red-100";
  }
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function actionButtonClass(action: RecommendedAction): string {
  if (action === "Release") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hoverable:hover:border-emerald-400/50";
  }
  if (action === "Request evidence") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100 hoverable:hover:border-amber-400/50";
  }
  return "border-red-500/30 bg-red-500/10 text-red-100 hoverable:hover:border-red-400/50";
}

function signalToneClass(tone: "low" | "medium" | "high" | "neutral"): string {
  if (tone === "high") {
    return "text-red-300";
  }
  if (tone === "medium") {
    return "text-amber-300";
  }
  if (tone === "low") {
    return "text-emerald-300";
  }
  return "text-zinc-200";
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export default App;
