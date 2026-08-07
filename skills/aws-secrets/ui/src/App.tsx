import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, type RevealedSecret, type SecretsResponse } from "./api";
import { toSecretItem, unique, updatedLabel, type SecretItem } from "./model";

const MASK = "••••••••••••••••";

function BrandMark(): React.JSX.Element {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function ErrorScreen({ error, retry }: { error: ApiError; retry: () => void }): React.JSX.Element {
  return (
    <main className="error-screen">
      <BrandMark />
      <p className="eyebrow">Sessão indisponível</p>
      <h1>A AWS precisa reconhecer você novamente.</h1>
      <p>{error.message}</p>
      <code>{error.message.match(/aws login[^.]+/)?.[0] ?? "aws login"}</code>
      <button type="button" onClick={retry}>Tentar novamente</button>
    </main>
  );
}

function Sidebar({
  items,
  domain,
  environment,
  onDomain,
  onEnvironment,
}: {
  items: SecretItem[];
  domain: string;
  environment: string;
  onDomain: (value: string) => void;
  onEnvironment: (value: string) => void;
}): React.JSX.Element {
  const domains = unique(items.map((item) => item.domain));
  const environments = unique(items.map((item) => item.environment));
  return (
    <nav className="sidebar" aria-label="Domains e ambientes">
      <section>
        <p className="rail-label">Domains</p>
        {["all", ...domains].map((value) => (
          <button
            type="button"
            className={domain === value ? "rail-item active" : "rail-item"}
            onClick={() => onDomain(value)}
            key={value}
          >
            <span>{value === "all" ? "Todos" : value}</span>
            <b>{value === "all" ? items.length : items.filter((item) => item.domain === value).length}</b>
          </button>
        ))}
      </section>
      <section>
        <p className="rail-label">Ambientes</p>
        {["all", ...environments].map((value) => (
          <button
            type="button"
            className={environment === value ? "rail-item active" : "rail-item"}
            onClick={() => onEnvironment(value)}
            key={value}
          >
            <span>{value === "all" ? "Todos" : value}</span>
            {value === "prod" ? <i className="live-dot" aria-label="produção" /> : null}
          </button>
        ))}
      </section>
      <p className="read-only-note">Somente leitura</p>
    </nav>
  );
}

function SecretList({
  items,
  selected,
  onSelect,
}: {
  items: SecretItem[];
  selected: string | undefined;
  onSelect: (item: SecretItem) => void;
}): React.JSX.Element {
  return (
    <section className="secret-list" aria-label="Secrets">
      <header>
        <p className="eyebrow">Inventário</p>
        <strong>{items.length} {items.length === 1 ? "secret" : "secrets"}</strong>
      </header>
      <div className="secret-scroll">
        {items.map((item) => (
          <button
            type="button"
            className={selected === item.name ? "secret-row selected" : "secret-row"}
            onClick={() => onSelect(item)}
            key={item.name}
            aria-label={item.key}
          >
            <span className="secret-key">{item.key}</span>
            <span className="secret-path">{item.domain} / {item.environment} / {item.product}</span>
            <span className={item.jsonBase64 ? "format-badge json" : "format-badge"}>
              {item.jsonBase64 ? "JSON · B64" : "TEXTO"}
            </span>
          </button>
        ))}
        {items.length === 0 ? <p className="empty-state">Nenhum secret encontrou esse caminho.</p> : null}
      </div>
    </section>
  );
}

function SecretDetail({ item }: { item: SecretItem | undefined }): React.JSX.Element {
  const [revealed, setRevealed] = useState<RevealedSecret>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setRevealed(undefined);
    setNotice("");
  }, [item?.name]);

  useEffect(() => {
    if (!revealed) return;
    const timeout = window.setTimeout(() => setRevealed(undefined), 30_000);
    return () => window.clearTimeout(timeout);
  }, [revealed]);

  if (!item) {
    return <section className="detail empty-detail" aria-label="Detalhes do secret">Escolha um secret.</section>;
  }

  const reveal = async (): Promise<void> => {
    setBusy(true);
    setNotice("");
    try {
      setRevealed(await api.reveal(item.name));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (decoded = false): Promise<void> => {
    setBusy(true);
    try {
      const fresh = await api.reveal(item.name);
      const value = decoded && fresh.decoded !== undefined
        ? JSON.stringify(fresh.decoded)
        : fresh.value;
      await navigator.clipboard.writeText(value);
      setNotice(decoded ? "JSON copiado." : "Secret copiado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="detail" aria-label="Detalhes do secret">
      <div className="detail-heading">
        <div>
          <p className="eyebrow">{item.domain} / {item.environment} / {item.product}</p>
          <h2>{item.key}</h2>
        </div>
        <span className="current-pill">AWSCURRENT</span>
      </div>

      <dl className="metadata-grid">
        <dt>Atualizado</dt><dd>{updatedLabel(item.updatedAt)}</dd>
        <dt>Formato</dt><dd>{item.jsonBase64 ? "JSON em base64" : "Texto puro"}</dd>
        <dt>ARN</dt><dd className="mono truncate">{item.arn ?? "Indisponível"}</dd>
      </dl>

      <div className="value-label"><span>Valor</span><span>fetch sob demanda</span></div>
      <div className={revealed ? "secret-value revealed" : "secret-value"} aria-live="polite">
        {revealed?.format === "json-base64" ? (
          <pre>{JSON.stringify(revealed.decoded, null, 2)}</pre>
        ) : (
          <code>{revealed?.value ?? MASK}</code>
        )}
      </div>

      <div className="detail-actions">
        <button type="button" className="secondary" disabled={busy} onClick={reveal}>
          {busy ? "Buscando..." : "Revelar por 30s"}
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => copy(false)}>
          {item.jsonBase64 ? "Copiar base64" : "Copiar"}
        </button>
        {item.jsonBase64 && revealed ? (
          <button type="button" className="text-button" disabled={busy} onClick={() => copy(true)}>
            Copiar JSON
          </button>
        ) : null}
      </div>
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      <p className="privacy-note">O valor não é armazenado pela UI e será ocultado ao trocar de item.</p>
    </section>
  );
}

export function App(): React.JSX.Element {
  const [data, setData] = useState<SecretsResponse>();
  const [error, setError] = useState<ApiError>();
  const [domain, setDomain] = useState("all");
  const [environment, setEnvironment] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const load = async (): Promise<void> => {
    setError(undefined);
    try {
      const response = await api.list();
      setData(response);
      setSelectedName((current) => current ?? response.secrets[0]?.name);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError("Não foi possível carregar os secrets."));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo(() => (data?.secrets ?? []).map(toSecretItem), [data?.secrets]);
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (domain === "all" || item.domain === domain) &&
          (environment === "all" || item.environment === environment) &&
          (!deferredQuery || item.name.includes(deferredQuery)),
      ),
    [deferredQuery, domain, environment, items],
  );
  const selected = items.find((item) => item.name === selectedName) ?? filtered[0];

  if (error) return <ErrorScreen error={error} retry={() => void load()} />;
  if (!data) return <main className="loading-screen"><BrandMark /><p>Conectando à AWS...</p></main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><BrandMark /><h1>Tapioca Secrets</h1></div>
        <label className="search-box">
          <span className="sr-only">Buscar secrets</span>
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar domain, product ou key"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="aws-context">
          <span>{data.context.profile}</span>
          <i />
          <span>{data.context.region}</span>
        </div>
      </header>
      <div className="workspace">
        <Sidebar
          items={items}
          domain={domain}
          environment={environment}
          onDomain={setDomain}
          onEnvironment={setEnvironment}
        />
        <SecretList items={filtered} selected={selected?.name} onSelect={(item) => setSelectedName(item.name)} />
        <SecretDetail item={selected} />
      </div>
    </main>
  );
}
