import {
  StrictMode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  EmailBuilder,
  TemplateLibrary,
  TEMPLATE_GALLERY,
  buildGallery,
  translatorFor,
} from "best-email-builder";
import "best-email-builder/styles.css";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Info,
  Languages,
  LayoutTemplate,
  Layers,
  Mail,
  ServerCog,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { createDemoStorage } from "./browserStorage.js";
import { COMPETITORS } from "./competitors.js";

const REPOSITORY_URL =
  import.meta.env.VITE_REPOSITORY_URL ||
  "https://github.com/SergeMiro/best-email-builder";

const INSTALL = "npm install best-email-builder";
const AUTHOR_URL = "https://smiro.dev";
const SENDER = { name: "Example Inc.", address: "1 Main Street, Springfield" };

const TEXT = {
  en: {
    eyebrow: "Open source · MIT",
    tagline:
      "Drag-and-drop email builder for React — MJML output that renders in Outlook, Gmail and Apple Mail.",
    chips: [
      "Outlook, Gmail, Apple Mail",
      "Ready-made templates",
      "Phone and tablet",
      "English and French",
    ],
    open: "Open the live demo",
    docs: "Documentation",
    alternative: "An open-source alternative to the editors of",
    alternativeNote:
      "The same drag-and-drop, inside your own app: no per-seat price, and your templates stay on your server.",
    features: [
      [
        "Two screens, take one or both",
        "A template bank, then the editor — or only the editor. Each one installs on its own.",
      ],
      [
        "Renders everywhere",
        "MJML compiled on your server: tables Outlook understands, layouts that hold in Gmail and Apple Mail.",
      ],
      [
        "Yours, end to end",
        "Templates, versions and images in your database. A strict allow-list checks every template before saving.",
      ],
    ],
    demo: "Demo",
    home: "Home",
    note: "Live demo: templates stay in this browser and the preview compiles in the browser. A real app compiles on its server.",
    copy: "Copy the install command",
    copied: "Copied",
    source: "Source code",
    madeBy: "Made by",
  },
  fr: {
    eyebrow: "Open source · MIT",
    tagline:
      "Constructeur de courriels par glisser-déposer pour React — un rendu MJML fidèle dans Outlook, Gmail et Apple Mail.",
    chips: [
      "Outlook, Gmail, Apple Mail",
      "Modèles prêts à l’emploi",
      "Téléphone et tablette",
      "Anglais et français",
    ],
    open: "Ouvrir la démo",
    docs: "Documentation",
    alternative: "Une alternative open source aux éditeurs de",
    alternativeNote:
      "Le même glisser-déposer, dans votre propre application : aucun prix par siège, et vos modèles restent sur votre serveur.",
    features: [
      [
        "Deux écrans, l’un ou les deux",
        "Une banque de modèles, puis l’éditeur — ou l’éditeur seul. Chacun s’installe séparément.",
      ],
      [
        "Un rendu partout",
        "Du MJML compilé sur votre serveur : des tableaux qu’Outlook comprend, des mises en page qui tiennent dans Gmail et Apple Mail.",
      ],
      [
        "À vous, de bout en bout",
        "Modèles, versions et images dans votre base. Une liste blanche stricte vérifie chaque modèle avant l’enregistrement.",
      ],
    ],
    demo: "Démo",
    home: "Accueil",
    note: "Démo en direct : les modèles restent dans ce navigateur, l’aperçu est compilé dans le navigateur. Une vraie application compile sur son serveur.",
    copy: "Copier la commande d’installation",
    copied: "Copié",
    source: "Code source",
    madeBy: "Réalisé par",
  },
};

const FEATURE_ICONS = [Layers, ShieldCheck, ServerCog];

const CHIP_ICONS = [Mail, LayoutTemplate, Smartphone, Languages];

const initialLocale = () => {
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (fromUrl === "en" || fromUrl === "fr") return fromUrl;
  return navigator.language?.startsWith("fr") ? "fr" : "en";
};

/** The product mark: an envelope whose flap opens on the letters "beb". */
function BrandMark() {
  const id = `beb${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg viewBox="0 0 40 30" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7d6ff7" />
          <stop offset="1" stopColor="#3b2fa8" />
        </linearGradient>
        <linearGradient id={`${id}flap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {/* the envelope: its body and a soft flap, kept quiet behind the letters */}
      <rect
        x="1"
        y="1"
        width="38"
        height="28"
        rx="7"
        fill={`url(#${id}body)`}
      />
      <path d="M3.2 2.6h33.6L20 13.4Z" fill={`url(#${id}flap)`} />
      <path
        d="M3.4 3.4 20 13.4 36.6 3.4"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.4"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="27"
        rx="6.5"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.18"
      />
      {/* "beb", drawn rather than typed so it looks the same in every font */}
      <g fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
        <path d="M6.3 12.6v11.8" />
        <circle cx="9.5" cy="21.2" r="3.2" />
        <path d="M16.8 21.2h6.4" />
        <path d="M23.2 21.2a3.2 3.2 0 1 0-1.06 2.38" strokeLinecap="butt" />
        <path d="M27.3 12.6v11.8" />
        <circle cx="30.5" cy="21.2" r="3.2" />
      </g>
    </svg>
  );
}

/** GitHub's mark (lucide no longer ships brand icons). */
function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/**
 * The author's mark, as on smiro.dev: a window, a spark in its corner and a
 * code sign inside, standing between the given name and the family name.
 */
function AuthorMark() {
  return (
    <svg className="made-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.5 6C7.022 6 4.782 6 3.391 7.172S2 10.229 2 14s0 5.657 1.391 6.828S7.021 22 11.5 22c4.478 0 6.718 0 8.109-1.172S21 17.771 21 14c0-1.17 0-2.158-.041-3" />
      <path d="m18.5 2l.258.697c.338.914.507 1.371.84 1.704c.334.334.791.503 1.705.841L22 5.5l-.697.258c-.914.338-1.371.507-1.704.84c-.334.334-.503.791-.841 1.705L18.5 9l-.258-.697c-.338-.914-.507-1.371-.84-1.704c-.334-.334-.791-.503-1.705-.841L15 5.5l.697-.258c.914-.338 1.371-.507 1.704-.84c.334-.334.503-.791.841-1.705z" />
      <path d="m15.5 12l1.227 1.057c.515.445.773.667.773.943s-.258.498-.773.943L15.5 16m-8-4l-1.227 1.057c-.515.445-.773.667-.773.943s.258.498.773.943L7.5 16m5-5l-2 6" />
    </svg>
  );
}

function InstallCommand({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (insecure context, permissions): the command stays selectable.
    }
  };
  return (
    <div className="install">
      <code>
        <b>$</b> {INSTALL}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? text.copied : text.copy}
        title={copied ? text.copied : text.copy}
      >
        {copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
}

/** Two lines of JSX: what a developer actually writes. */
function CodeSample() {
  return (
    <figure className="code">
      <figcaption className="code-bar">
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <span>App.jsx</span>
      </figcaption>
      <pre>
        <code>
          <span className="k">import</span> {"{ "}
          <span className="f">EmailStudio</span>
          {" }"} <span className="k">from</span>{" "}
          <span className="s">&apos;best-email-builder&apos;</span>;{"\n\n"}
          <span className="t">&lt;EmailStudio</span>{" "}
          <span className="a">storage</span>={"{"}
          <span className="f">createHttpStorage</span>(){"}"}{" "}
          <span className="a">locale</span>=
          <span className="s">&quot;fr&quot;</span>{" "}
          <span className="t">/&gt;</span>
        </code>
      </pre>
    </figure>
  );
}

/**
 * The background follows the pointer, slowly: a soft light and a dot grid
 * that brightens around it. CSS variables only — no re-render — and nothing
 * follows the pointer for people who asked for reduced motion.
 */
function usePointerGlow(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined;
    const target = { x: 0.5, y: 0.15 };
    const current = { ...target };
    let frame = 0;
    const tick = () => {
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;
      el.style.setProperty("--mx", `${(current.x * 100).toFixed(2)}%`);
      el.style.setProperty("--my", `${(current.y * 100).toFixed(2)}%`);
      frame =
        Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.0005
          ? requestAnimationFrame(tick)
          : 0;
    };
    const onMove = (event) => {
      target.x = event.clientX / window.innerWidth;
      target.y = event.clientY / window.innerHeight;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/**
 * Three pages, in the URL hash so the static demo needs no server rewrite:
 *
 *   #/                    landing
 *   #/templates           level 1 — the template bank (TemplateLibrary)
 *   #/editor/new          level 2 — the editor (EmailBuilder), blank
 *   #/editor/base/<id>    level 2, from a base of the gallery
 *   #/editor/<id>         level 2, a saved template
 */
function parseRoute(hash) {
  const parts = hash
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  if (parts[0] === "templates") return { page: "templates" };
  if (parts[0] === "editor") {
    if (parts[1] === "base" && parts[2])
      return { page: "editor", baseId: parts[2] };
    if (parts[1] && parts[1] !== "new")
      return { page: "editor", templateId: parts[1] };
    return { page: "editor" };
  }
  return { page: "home" };
}

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((to) => {
    window.location.hash = to;
  }, []);
  return [useMemo(() => parseRoute(hash), [hash]), navigate];
}

function TopBar({ text, locale, setLocale, crumb }) {
  // On the bank page the bar lines up with the wide window under it.
  return (
    <header className={crumb ? "wrap wrap-wide topbar" : "wrap topbar"}>
      <span className="brand-row">
        <a
          className="brand"
          href="#/"
          aria-label={`Best Email Builder — ${text.home}`}
        >
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span className="brand-name">Best Email Builder</span>
        </a>
        {crumb && (
          <span className="crumb">
            <ChevronRight aria-hidden="true" />
            {crumb}
          </span>
        )}
      </span>
      <div className="topbar-actions">
        <div className="segmented" role="group" aria-label="Language">
          {["en", "fr"].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={code === locale}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <a className="btn" href={REPOSITORY_URL} aria-label={text.source}>
          <GitHubMark />
          <span className="btn-label">{text.source}</span>
        </a>
      </div>
    </header>
  );
}

function Footer({ text }) {
  return (
    <footer className="wrap footer">
      <a className="made" href={AUTHOR_URL} target="_blank" rel="noopener">
        © 2026 {text.madeBy}
        <span className="made-sig">
          Sergiy
          <AuthorMark />
          Miro
        </span>
      </a>
    </footer>
  );
}

/** A brand of the marquee: its mark from Simple Icons, or a monogram. */
function Competitor({ name, path }) {
  return (
    <span className="rival">
      {path ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={path} />
        </svg>
      ) : (
        <span className="rival-mono" aria-hidden="true">
          {name[0]}
        </span>
      )}
      {name}
    </span>
  );
}

function Alternatives({ text }) {
  return (
    <section className="alt" aria-labelledby="alt-title">
      <p id="alt-title" className="alt-label">
        {text.alternative}
      </p>
      <div className="marquee">
        {/* Two copies: the track slides by exactly one, so the loop has no seam. */}
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              className="marquee-list"
              aria-hidden={copy === 1 ? "true" : undefined}
            >
              {COMPETITORS.map((c) => (
                <li key={c.name}>
                  <Competitor {...c} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <p className="alt-note">{text.alternativeNote}</p>
    </section>
  );
}

function Landing({ text }) {
  return (
    <main>
      <section className="wrap hero">
        <span className="eyebrow">
          <i aria-hidden="true" />
          {text.eyebrow}
        </span>
        <h1>
          Best <span>Email Builder</span>
        </h1>
        <p className="tagline">{text.tagline}</p>
        <div className="cta">
          <a className="btn btn-primary btn-lg" href="#/templates">
            {text.open}
            <ArrowRight aria-hidden="true" />
          </a>
          <a className="btn btn-lg" href={`${REPOSITORY_URL}#readme`}>
            <BookOpen aria-hidden="true" />
            {text.docs}
          </a>
        </div>
        <div className="chips">
          {text.chips.map((label, i) => {
            const Icon = CHIP_ICONS[i];
            return (
              <span key={label} className="chip">
                <Icon aria-hidden="true" />
                {label}
              </span>
            );
          })}
        </div>
        <div className="dev">
          <InstallCommand text={text} />
          <CodeSample />
        </div>
      </section>

      <Alternatives text={text} />

      <section className="wrap features">
        {text.features.map(([title, body], i) => {
          const Icon = FEATURE_ICONS[i];
          return (
            <article key={title} className="feature">
              <span className="feature-icon">
                <Icon aria-hidden="true" />
              </span>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function App() {
  const storage = useMemo(() => createDemoStorage(), []);
  const [locale, setLocale] = useState(initialLocale);
  const [route, navigate] = useHashRoute();
  /** The template to select when coming back to the bank. */
  const [lastId, setLastId] = useState(null);
  const pageRef = useRef(null);
  usePointerGlow(pageRef);
  const text = TEXT[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page]);

  // Level 2: the editor alone, full screen. The bank only hands it a template.
  if (route.page === "editor") {
    const base = route.baseId
      ? buildGallery({
          templates: TEMPLATE_GALLERY,
          sender: SENDER,
          t: translatorFor(locale),
        }).find((b) => b.id === route.baseId)
      : null;
    return (
      <EmailBuilder
        key={`${route.templateId ?? route.baseId ?? "new"}-${locale}`}
        storage={storage}
        templateId={route.templateId ?? null}
        initialMjml={base?.mjml}
        initialMeta={
          base
            ? { subject: base.subject, preheader: base.preheader }
            : undefined
        }
        locale={locale}
        sender={SENDER}
        onSaved={(template) => {
          if (template?.id == null) return;
          setLastId(template.id);
          // The address follows the saved template (a reload reopens it) without
          // a hashchange, which would remount the editor.
          window.history.replaceState(
            null,
            "",
            `#/editor/${encodeURIComponent(template.id)}`,
          );
        }}
        onClose={() => navigate("/templates")}
      />
    );
  }

  return (
    <div className={`landing page-${route.page}`} ref={pageRef}>
      <div className="backdrop" aria-hidden="true" />
      <TopBar
        text={text}
        locale={locale}
        setLocale={setLocale}
        crumb={route.page === "templates" ? text.demo : null}
      />
      {route.page === "templates" ? (
        <main className="wrap wrap-wide bank">
          <section className="window" aria-label={text.demo}>
            <TemplateLibrary
              storage={storage}
              locale={locale}
              sender={SENDER}
              selectedId={lastId}
              onClose={() => navigate("/")}
              onEdit={(template) => {
                setLastId(template.id);
                navigate(`/editor/${encodeURIComponent(template.id)}`);
              }}
              onCreate={(start) =>
                navigate(
                  start?.baseId
                    ? `/editor/base/${encodeURIComponent(start.baseId)}`
                    : "/editor/new",
                )
              }
            />
          </section>
          <p className="note">
            <Info aria-hidden="true" />
            <span>{text.note}</span>
          </p>
        </main>
      ) : (
        <Landing text={text} />
      )}
      <Footer text={text} />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
