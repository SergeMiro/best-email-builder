import { StrictMode, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
// The two blocks through their own entries, as an application using them apart would.
import { EmailBuilder, TEMPLATE_GALLERY, buildGallery, translatorFor } from 'best-email-builder/builder';
import { TemplateLibrary } from 'best-email-builder/library';
import 'best-email-builder/styles.css';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Languages,
  LayoutTemplate,
  Layers,
  Mail,
  Maximize2,
  Minimize2,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { createBrowserAi, createDemoStorage } from './browserStorage.js';
import { COMPETITORS } from './competitors.js';
import { initialLocale, rememberLocale } from './locale.js';

const REPOSITORY_URL = import.meta.env.VITE_REPOSITORY_URL || 'https://github.com/SergeMiro/best-email-builder';

const INSTALL = 'npm install best-email-builder';
const AUTHOR_URL = 'https://smiro.dev';
const SENDER = { name: 'Example Inc.', address: '1 Main Street, Springfield' };

const TEXT = {
  en: {
    eyebrow: 'Open source · MIT',
    tagline: 'Drag-and-drop email builder for React — MJML output that renders in Outlook, Gmail and Apple Mail.',
    chips: ['Outlook, Gmail, Apple Mail', 'Ready-made templates', 'Phone and tablet', '7 languages'],
    open: 'Open the live demo',
    docs: 'Documentation',
    alternative: 'An open-source alternative to the editors of',
    alternativeNote: 'The same drag-and-drop, inside your own app: no per-seat price, and your templates stay on your server.',
    features: [
      ['Two screens, take one or both', 'A template library, then the editor — or only the editor. Each one installs on its own.'],
      ['Renders everywhere', 'MJML compiled on your server: tables Outlook understands, layouts that hold in Gmail and Apple Mail.'],
      ['Yours, end to end', 'Templates, versions and images in your database. A strict allow-list checks every template before saving.'],
    ],
    demo: 'Demo',
    home: 'Home',
    codeTitle: 'How to install it',
    codeTabs: { both: 'Library + editor', builder: 'Editor only', library: 'Library only', ai: 'With AI' },
    stepBank: 'Template library',
    stepEditor: 'Editor',
    expand: 'Full screen',
    shrink: 'Exit full screen',
    note: 'Live demo: templates stay in this browser and the preview compiles in the browser. A real app compiles on its server.',
    aiNote: '“Generate” writes a whole email, “Rewrite with AI” reworks a selected text and “Suggest subjects” offers three subject lines, with your own key: OpenAI, Claude, Mistral, Gemini, OpenRouter or any OpenAI-compatible API. Gemini and Mistral are free and answer in seconds; OpenRouter’s free models take minutes. The key stays in this browser and goes only to the provider you choose.',
    aiConnected: 'Connected to {provider} · {model}.',
    aiChange: 'Change provider or model',
    aiForget: 'Forget my key',
    copy: 'Copy the install command',
    copied: 'Copied',
    source: 'Source code',
    madeBy: 'Made by',
    language: 'Language',
    comments: {
      opened: 'opened from your own library',
      optional: 'Optional: without `ai`, no AI button and no AI code.',
      keys: 'Each user picks a provider and connects their own key:',
    },
  },
  fr: {
    eyebrow: 'Open source · MIT',
    tagline: 'Constructeur de courriels par glisser-déposer pour React — un rendu MJML fidèle dans Outlook, Gmail et Apple Mail.',
    chips: ['Outlook, Gmail, Apple Mail', 'Modèles prêts à l’emploi', 'Téléphone et tablette', '7 langues'],
    open: 'Ouvrir la démo',
    docs: 'Documentation',
    alternative: 'Une alternative open source aux éditeurs de',
    alternativeNote: 'Le même glisser-déposer, dans votre propre application : aucun prix par siège, et vos modèles restent sur votre serveur.',
    features: [
      ['Deux écrans, l’un ou les deux', 'Une bibliothèque de modèles, puis l’éditeur — ou l’éditeur seul. Chacun s’installe séparément.'],
      ['Un rendu partout', 'Du MJML compilé sur votre serveur : des tableaux qu’Outlook comprend, des mises en page qui tiennent dans Gmail et Apple Mail.'],
      ['À vous, de bout en bout', 'Modèles, versions et images dans votre base. Une liste blanche stricte vérifie chaque modèle avant l’enregistrement.'],
    ],
    demo: 'Démo',
    home: 'Accueil',
    codeTitle: 'Comment l’installer',
    codeTabs: { both: 'Bibliothèque + éditeur', builder: 'Éditeur seul', library: 'Bibliothèque seule', ai: 'Avec l’IA' },
    stepBank: 'Bibliothèque de modèles',
    stepEditor: 'Éditeur',
    expand: 'Plein écran',
    shrink: 'Réduire',
    note: 'Démo en direct : les modèles restent dans ce navigateur, l’aperçu est compilé dans le navigateur. Une vraie application compile sur son serveur.',
    aiNote: '« Générer » écrit un e-mail complet, « Réécrire avec l’IA » retravaille le texte sélectionné et « Suggérer des objets » propose trois objets, avec votre propre clé : OpenAI, Claude, Mistral, Gemini, OpenRouter ou toute API compatible OpenAI. Gemini et Mistral sont gratuits et répondent en quelques secondes ; les modèles gratuits d’OpenRouter prennent plusieurs minutes. La clé reste dans ce navigateur et n’est envoyée qu’au fournisseur choisi.',
    aiConnected: 'Connecté à {provider} · {model}.',
    aiChange: 'Changer de fournisseur ou de modèle',
    aiForget: 'Oublier ma clé',
    copy: 'Copier la commande d’installation',
    copied: 'Copié',
    source: 'Code source',
    madeBy: 'Réalisé par',
    language: 'Langue',
    comments: {
      opened: 'ouvert depuis votre propre bibliothèque',
      optional: 'Facultatif : sans `ai`, ni bouton IA ni code IA.',
      keys: 'Chaque utilisateur choisit un fournisseur et connecte sa propre clé :',
    },
  },
  de: {
    eyebrow: 'Open Source · MIT',
    tagline: 'Drag-and-drop-E-Mail-Builder für React — MJML, das in Outlook, Gmail und Apple Mail richtig dargestellt wird.',
    chips: ['Outlook, Gmail, Apple Mail', 'Fertige Vorlagen', 'Smartphone und Tablet', '7 Sprachen'],
    open: 'Live-Demo öffnen',
    docs: 'Dokumentation',
    alternative: 'Eine Open-Source-Alternative zu den Editoren von',
    alternativeNote: 'Dasselbe Drag-and-drop in Ihrer eigenen App: kein Preis pro Nutzer, und Ihre Vorlagen bleiben auf Ihrem Server.',
    features: [
      ['Zwei Ansichten, eine oder beide', 'Eine Vorlagenbibliothek, dann der Editor — oder nur der Editor. Beide lassen sich einzeln installieren.'],
      ['Überall richtig dargestellt', 'MJML, kompiliert auf Ihrem Server: Tabellen, die Outlook versteht, Layouts, die in Gmail und Apple Mail halten.'],
      ['Ganz in Ihrer Hand', 'Vorlagen, Versionen und Bilder in Ihrer Datenbank. Eine strenge Positivliste prüft jede Vorlage vor dem Speichern.'],
    ],
    demo: 'Demo',
    home: 'Startseite',
    codeTitle: 'So installieren Sie es',
    codeTabs: { both: 'Bibliothek + Editor', builder: 'Nur Editor', library: 'Nur Bibliothek', ai: 'Mit KI' },
    stepBank: 'Vorlagenbibliothek',
    stepEditor: 'Editor',
    expand: 'Vollbild',
    shrink: 'Vollbild beenden',
    note: 'Live-Demo: Die Vorlagen bleiben in diesem Browser, die Vorschau wird im Browser kompiliert. Eine echte App kompiliert auf ihrem Server.',
    aiNote: '„Generieren“ schreibt eine ganze E-Mail, „Mit KI umschreiben“ überarbeitet einen markierten Text und „Betreff vorschlagen“ bietet drei Betreffzeilen an — mit Ihrem eigenen Schlüssel: OpenAI, Claude, Mistral, Gemini, OpenRouter oder jede OpenAI-kompatible API. Gemini und Mistral sind kostenlos und antworten in Sekunden; die kostenlosen Modelle von OpenRouter brauchen Minuten. Der Schlüssel bleibt in diesem Browser und geht nur an den gewählten Anbieter.',
    aiConnected: 'Verbunden mit {provider} · {model}.',
    aiChange: 'Anbieter oder Modell wechseln',
    aiForget: 'Meinen Schlüssel vergessen',
    copy: 'Installationsbefehl kopieren',
    copied: 'Kopiert',
    source: 'Quellcode',
    madeBy: 'Erstellt von',
    language: 'Sprache',
    comments: {
      opened: 'aus Ihrer eigenen Bibliothek geöffnet',
      optional: 'Optional: ohne `ai` weder KI-Schaltfläche noch KI-Code.',
      keys: 'Jeder Nutzer wählt einen Anbieter und verbindet seinen eigenen Schlüssel:',
    },
  },
  es: {
    eyebrow: 'Código abierto · MIT',
    tagline: 'Editor de correos de arrastrar y soltar para React — MJML que se ve bien en Outlook, Gmail y Apple Mail.',
    chips: ['Outlook, Gmail, Apple Mail', 'Plantillas listas para usar', 'Móvil y tableta', '7 idiomas'],
    open: 'Abrir la demo',
    docs: 'Documentación',
    alternative: 'Una alternativa de código abierto a los editores de',
    alternativeNote: 'El mismo arrastrar y soltar, dentro de tu propia aplicación: sin precio por usuario, y tus plantillas se quedan en tu servidor.',
    features: [
      ['Dos pantallas: una o las dos', 'Una biblioteca de plantillas y luego el editor, o solo el editor. Cada uno se instala por separado.'],
      ['Se ve bien en todas partes', 'MJML compilado en tu servidor: tablas que Outlook entiende y diseños que aguantan en Gmail y Apple Mail.'],
      ['Tuyo de principio a fin', 'Plantillas, versiones e imágenes en tu base de datos. Una lista de permitidos estricta revisa cada plantilla antes de guardarla.'],
    ],
    demo: 'Demo',
    home: 'Inicio',
    codeTitle: 'Cómo instalarlo',
    codeTabs: { both: 'Biblioteca + editor', builder: 'Solo el editor', library: 'Solo la biblioteca', ai: 'Con IA' },
    stepBank: 'Biblioteca de plantillas',
    stepEditor: 'Editor',
    expand: 'Pantalla completa',
    shrink: 'Salir de pantalla completa',
    note: 'Demo en vivo: las plantillas se quedan en este navegador y la vista previa se compila en el navegador. Una aplicación real compila en su servidor.',
    aiNote: '“Generar” escribe un correo completo, “Reescribir con IA” rehace el texto seleccionado y “Sugerir asuntos” propone tres asuntos, con tu propia clave: OpenAI, Claude, Mistral, Gemini, OpenRouter o cualquier API compatible con OpenAI. Gemini y Mistral son gratuitos y responden en segundos; los modelos gratuitos de OpenRouter tardan minutos. La clave se queda en este navegador y solo se envía al proveedor que elijas.',
    aiConnected: 'Conectado a {provider} · {model}.',
    aiChange: 'Cambiar de proveedor o de modelo',
    aiForget: 'Olvidar mi clave',
    copy: 'Copiar el comando de instalación',
    copied: 'Copiado',
    source: 'Código fuente',
    madeBy: 'Hecho por',
    language: 'Idioma',
    comments: {
      opened: 'abierta desde tu propia biblioteca',
      optional: 'Opcional: sin `ai`, ni botón de IA ni código de IA.',
      keys: 'Cada usuario elige un proveedor y conecta su propia clave:',
    },
  },
  pt: {
    eyebrow: 'Código aberto · MIT',
    tagline: 'Editor de e-mails com arrastar e soltar para React — MJML exibido corretamente no Outlook, no Gmail e no Apple Mail.',
    chips: ['Outlook, Gmail, Apple Mail', 'Modelos prontos', 'Celular e tablet', '7 idiomas'],
    open: 'Abrir a demo',
    docs: 'Documentação',
    alternative: 'Uma alternativa de código aberto aos editores de',
    alternativeNote: 'O mesmo arrastar e soltar, dentro do seu próprio app: sem preço por usuário, e seus modelos ficam no seu servidor.',
    features: [
      ['Duas telas: use uma ou as duas', 'Uma biblioteca de modelos e depois o editor — ou só o editor. Cada um é instalado separadamente.'],
      ['Funciona em todo lugar', 'MJML compilado no seu servidor: tabelas que o Outlook entende e layouts que se mantêm no Gmail e no Apple Mail.'],
      ['Seu, de ponta a ponta', 'Modelos, versões e imagens no seu banco de dados. Uma lista de permissões rigorosa verifica cada modelo antes de salvar.'],
    ],
    demo: 'Demo',
    home: 'Início',
    codeTitle: 'Como instalar',
    codeTabs: { both: 'Biblioteca + editor', builder: 'Só o editor', library: 'Só a biblioteca', ai: 'Com IA' },
    stepBank: 'Biblioteca de modelos',
    stepEditor: 'Editor',
    expand: 'Tela cheia',
    shrink: 'Sair da tela cheia',
    note: 'Demo ao vivo: os modelos ficam neste navegador e a pré-visualização é compilada no navegador. Um app de verdade compila no próprio servidor.',
    aiNote: '“Gerar” escreve um e-mail completo, “Reescrever com IA” refaz o texto selecionado e “Sugerir assuntos” propõe três assuntos, com a sua própria chave: OpenAI, Claude, Mistral, Gemini, OpenRouter ou qualquer API compatível com OpenAI. Gemini e Mistral são gratuitos e respondem em segundos; os modelos gratuitos do OpenRouter levam minutos. A chave fica neste navegador e só é enviada ao provedor que você escolher.',
    aiConnected: 'Conectado a {provider} · {model}.',
    aiChange: 'Trocar de provedor ou de modelo',
    aiForget: 'Esquecer minha chave',
    copy: 'Copiar o comando de instalação',
    copied: 'Copiado',
    source: 'Código-fonte',
    madeBy: 'Feito por',
    language: 'Idioma',
    comments: {
      opened: 'aberto a partir da sua própria biblioteca',
      optional: 'Opcional: sem `ai`, nem botão de IA nem código de IA.',
      keys: 'Cada usuário escolhe um provedor e conecta a própria chave:',
    },
  },
  ru: {
    eyebrow: 'Открытый код · MIT',
    tagline: 'Конструктор писем с перетаскиванием для React — MJML, который правильно отображается в Outlook, Gmail и Apple Mail.',
    chips: ['Outlook, Gmail, Apple Mail', 'Готовые шаблоны', 'Телефон и планшет', '7 языков'],
    open: 'Открыть демо',
    docs: 'Документация',
    alternative: 'Альтернатива с открытым кодом редакторам',
    alternativeNote: 'То же перетаскивание, но внутри вашего приложения: никакой оплаты за пользователя, а шаблоны остаются на вашем сервере.',
    features: [
      ['Два экрана — один или оба', 'Библиотека шаблонов, затем редактор — или только редактор. Каждый устанавливается отдельно.'],
      ['Отображается везде', 'MJML компилируется на вашем сервере: таблицы, которые понимает Outlook, и вёрстка, которая не разваливается в Gmail и Apple Mail.'],
      ['Всё остаётся у вас', 'Шаблоны, версии и изображения — в вашей базе данных. Строгий белый список проверяет каждый шаблон перед сохранением.'],
    ],
    demo: 'Демо',
    home: 'Главная',
    codeTitle: 'Как установить',
    codeTabs: { both: 'Библиотека + редактор', builder: 'Только редактор', library: 'Только библиотека', ai: 'С ИИ' },
    stepBank: 'Библиотека шаблонов',
    stepEditor: 'Редактор',
    expand: 'Во весь экран',
    shrink: 'Выйти из полноэкранного режима',
    note: 'Живое демо: шаблоны хранятся в этом браузере, предпросмотр компилируется тоже в браузере. Настоящее приложение компилирует на своём сервере.',
    aiNote: '«Сгенерировать» пишет письмо целиком, «Переписать с помощью ИИ» перерабатывает выделенный текст, а «Предложить темы» даёт три варианта темы — с вашим собственным ключом: OpenAI, Claude, Mistral, Gemini, OpenRouter или любой OpenAI-совместимый API. Gemini и Mistral бесплатны и отвечают за секунды; бесплатным моделям OpenRouter нужны минуты. Ключ остаётся в этом браузере и уходит только выбранному провайдеру.',
    aiConnected: 'Подключено: {provider} · {model}.',
    aiChange: 'Сменить провайдера или модель',
    aiForget: 'Забыть мой ключ',
    copy: 'Скопировать команду установки',
    copied: 'Скопировано',
    source: 'Исходный код',
    madeBy: 'Сделал',
    language: 'Язык',
    comments: {
      opened: 'открыт из вашей библиотеки',
      optional: 'Необязательно: без `ai` нет ни кнопки ИИ, ни кода ИИ.',
      keys: 'Каждый пользователь выбирает провайдера и подключает свой ключ:',
    },
  },
  zh: {
    eyebrow: '开源 · MIT',
    tagline: '适用于 React 的拖放式邮件编辑器——输出 MJML，在 Outlook、Gmail 和 Apple Mail 中都能正确显示。',
    chips: ['Outlook、Gmail、Apple Mail', '现成模板', '手机和平板', '7 种语言'],
    open: '打开在线演示',
    docs: '文档',
    alternative: '开源的替代方案，可替代以下编辑器：',
    alternativeNote: '同样的拖放体验，直接嵌入您自己的应用：不按席位收费，模板始终保存在您的服务器上。',
    features: [
      ['两个界面，可单用可合用', '先是模板库，再进入编辑器——或者只用编辑器。两者都可以单独安装。'],
      ['处处显示正常', 'MJML 在您的服务器上编译：Outlook 能识别的表格，在 Gmail 和 Apple Mail 中也不会走样的布局。'],
      ['完全由您掌控', '模板、版本和图片都在您的数据库中。保存前，严格的白名单会检查每个模板。'],
    ],
    demo: '演示',
    home: '首页',
    codeTitle: '如何安装',
    codeTabs: { both: '模板库 + 编辑器', builder: '仅编辑器', library: '仅模板库', ai: '搭配 AI' },
    stepBank: '模板库',
    stepEditor: '编辑器',
    expand: '全屏',
    shrink: '退出全屏',
    note: '在线演示：模板保存在当前浏览器中，预览也在浏览器中编译。真实应用会在自己的服务器上编译。',
    aiNote: '“生成”写出一封完整的邮件，“AI 改写”重写选中的文字，“推荐主题”给出三个邮件主题——使用您自己的密钥：OpenAI、Claude、Mistral、Gemini、OpenRouter 或任何 OpenAI 兼容 API。Gemini 和 Mistral 免费，几秒内即可回复；OpenRouter 的免费模型需要几分钟。密钥只保存在当前浏览器中，且只发送给您选择的服务商。',
    aiConnected: '已连接 {provider} · {model}。',
    aiChange: '更换服务商或模型',
    aiForget: '忘记我的密钥',
    copy: '复制安装命令',
    copied: '已复制',
    source: '源代码',
    madeBy: '作者',
    language: '语言',
    comments: {
      opened: '从您自己的模板库中打开',
      optional: '可选：不传 `ai`，就没有 AI 按钮，也不加载 AI 代码。',
      keys: '每位用户选择一个服务商，并连接自己的密钥：',
    },
  },
};

/** The languages of the switcher, each in its own words. */
const LANGUAGES = [
  ['en', 'English'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['ru', 'Русский'],
  ['zh', '中文'],
];

const FEATURE_ICONS = [Layers, ShieldCheck, ServerCog];

const CHIP_ICONS = [Mail, LayoutTemplate, Smartphone, Languages];


/** The product mark: an envelope whose flap opens on the letters "beb". */
function BrandMark() {
  const id = `beb${useId().replace(/[^\w-]/g, '')}`;
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
      <rect x="1" y="1" width="38" height="28" rx="7" fill={`url(#${id}body)`} />
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
      <rect x="1.5" y="1.5" width="37" height="27" rx="6.5" fill="none" stroke="#fff" strokeOpacity="0.18" />
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
      <button type="button" onClick={copy} aria-label={copied ? text.copied : text.copy} title={copied ? text.copied : text.copy}>
        {copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
}

/**
 * The ways to install it: both blocks, the editor alone, the bank alone, with
 * the AI. Their comments are in the page's language, and so is `locale`.
 */
const CODE_SAMPLES = [
  {
    id: 'both',
    code: (comments, locale) => `import { EmailStudio, createHttpStorage } from 'best-email-builder';

<EmailStudio storage={createHttpStorage()} locale="${locale}" />`,
  },
  {
    id: 'builder',
    code: (comments) => `import { EmailBuilder } from 'best-email-builder/builder';

<EmailBuilder
  storage={storage}
  templateId={id}           // ${comments.opened}
  onSaved={refreshMyList}
  onClose={backToMyList}
/>`,
  },
  {
    id: 'library',
    code: () => `import { TemplateLibrary } from 'best-email-builder/library';

<TemplateLibrary
  storage={storage}
  onEdit={(template) => openMyEditor(template.id)}
  onCreate={(start) => openMyEditor(start)}
/>`,
  },
  {
    id: 'ai',
    code: (comments) => `import Anthropic from '@anthropic-ai/sdk';
import { claudeProvider, createAi } from 'best-email-builder/ai';

// ${comments.optional}
const claude = claudeProvider({
  client: (apiKey) =>
    new Anthropic({ apiKey, dangerouslyAllowBrowser: true }),
});

// ${comments.keys}
const ai = createAi({
  provider: [
    'openai',      // ChatGPT
    claude,        // Anthropic
    'mistral',
    'gemini',
    'openrouter',
    'openai-compatible', // LM Studio, vLLM, a proxy…
  ],
  askKey: true,
});

<EmailStudio storage={storage} ai={ai} />`,
  },
];

/** Just enough colouring for the samples above (our own text, never user input). */
const TOKENS =
  /(\/\/[^\n]*)|('[^']*'|"[^"]*")|\b(import|from)\b|(<\/?[A-Z]\w*|\/?(?<!=)>)|(\b\w+(?==))|(\b\w+(?=\())/g;
const TOKEN_CLASSES = ['c', 's', 'k', 't', 'a', 'f'];

function highlight(code) {
  const out = [];
  let last = 0;
  for (const match of code.matchAll(TOKENS)) {
    if (match.index > last) out.push(code.slice(last, match.index));
    const group = match.slice(1).findIndex((part) => part !== undefined);
    out.push(
      <span key={match.index} className={TOKEN_CLASSES[group]}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  out.push(code.slice(last));
  return out;
}

function CodeSample({ text, locale }) {
  const [current, setCurrent] = useState('both');
  const sample = CODE_SAMPLES.find((s) => s.id === current);
  // Arrow keys move between the tabs, as in any tab list.
  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = CODE_SAMPLES.findIndex((s) => s.id === current);
    const next = CODE_SAMPLES[(index + step + CODE_SAMPLES.length) % CODE_SAMPLES.length].id;
    setCurrent(next);
    document.getElementById(`code-tab-${next}`)?.focus();
  };
  return (
    <figure className="code">
      <figcaption className="code-bar">
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <span className="code-tabs" role="tablist" aria-label={text.codeTitle} onKeyDown={onKeyDown}>
          {CODE_SAMPLES.map((s) => (
            <button
              key={s.id}
              id={`code-tab-${s.id}`}
              type="button"
              role="tab"
              aria-selected={s.id === current}
              aria-controls="code-panel"
              tabIndex={s.id === current ? 0 : -1}
              onClick={() => setCurrent(s.id)}
            >
              {text.codeTabs[s.id]}
            </button>
          ))}
        </span>
      </figcaption>
      <pre id="code-panel" role="tabpanel" aria-labelledby={`code-tab-${current}`} tabIndex={0}>
        <code>{highlight(sample.code(text.comments, locale))}</code>
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
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const target = { x: 0.5, y: 0.15 };
    const current = { ...target };
    let frame = 0;
    const tick = () => {
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;
      el.style.setProperty('--mx', `${(current.x * 100).toFixed(2)}%`);
      el.style.setProperty('--my', `${(current.y * 100).toFixed(2)}%`);
      frame = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.0005 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (event) => {
      target.x = event.clientX / window.innerWidth;
      target.y = event.clientY / window.innerHeight;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
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
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'templates') return { page: 'templates' };
  if (parts[0] === 'editor') {
    if (parts[1] === 'base' && parts[2]) return { page: 'editor', baseId: parts[2] };
    if (parts[1] && parts[1] !== 'new') return { page: 'editor', templateId: parts[1] };
    return { page: 'editor' };
  }
  return { page: 'home' };
}

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((to) => {
    window.location.hash = to;
  }, []);
  return [useMemo(() => parseRoute(hash), [hash]), navigate];
}

/**
 * The language, as a list of the page's own: the system's list cannot be
 * styled. A select-only combobox (WAI-ARIA): the focus stays on the button
 * while the arrows, Home / End and the first letters move through the list;
 * Enter or Space picks, Escape and a click elsewhere close it.
 */
function LanguagePicker({ label, locale, setLocale }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const listId = useId();
  const selected = Math.max(0, LANGUAGES.findIndex(([code]) => code === locale));
  const [currentCode, currentName] = LANGUAGES[selected];
  const optionId = (index) => `${listId}-${index}`;

  const show = (index = selected) => {
    setActive(index);
    setOpen(true);
  };
  const pick = (index) => {
    setOpen(false);
    const [code] = LANGUAGES[index];
    if (code !== locale) setLocale(code);
  };

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  });

  /** The next language whose name starts with what was just typed. */
  const matching = (key) => {
    const now = Date.now();
    const text = now - typed.current.at < 600 ? typed.current.text + key : key;
    typed.current = { text, at: now };
    const from = open ? active + (text.length === 1 ? 1 : 0) : selected + 1;
    for (let step = 0; step < LANGUAGES.length; step += 1) {
      const index = (from + step) % LANGUAGES.length;
      if (LANGUAGES[index][1].toLocaleLowerCase().startsWith(text.toLocaleLowerCase())) return index;
    }
    return -1;
  };

  const onKeyDown = (event) => {
    const last = LANGUAGES.length - 1;
    const moves = { ArrowDown: Math.min(active + 1, last), ArrowUp: Math.max(active - 1, 0), Home: 0, End: last, PageDown: last, PageUp: 0 };
    if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const index = matching(event.key);
      if (index >= 0) show(index);
      return;
    }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        show();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        show(event.key === 'Home' ? 0 : last);
      }
      return;
    }
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(active);
    } else if (event.key === 'Escape') {
      // Handled here: the full-screen demo does not close with it.
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="lang" ref={root}>
      <div
        className="lang-button"
        role="combobox"
        tabIndex={0}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <Languages aria-hidden="true" />
        <span lang={currentCode}>{currentName}</span>
        <ChevronDown aria-hidden="true" />
      </div>
      {open && (
        <ul className="lang-list" id={listId} role="listbox" aria-label={label}>
          {LANGUAGES.map(([code, name], index) => (
            <li
              key={code}
              id={optionId(index)}
              className="lang-option"
              role="option"
              aria-selected={index === selected}
              data-active={index === active || undefined}
              lang={code}
              // The focus stays on the button.
              onMouseDown={(event) => event.preventDefault()}
              onPointerMove={() => setActive(index)}
              onClick={() => pick(index)}
            >
              <Check className="lang-check" aria-hidden="true" />
              <span className="lang-name">{name}</span>
              <span className="lang-code" aria-hidden="true">
                {code}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopBar({ text, locale, setLocale, crumb }) {
  // On the bank page the bar lines up with the wide window under it.
  return (
    <header className={crumb ? 'wrap wrap-wide topbar' : 'wrap topbar'}>
      <span className="brand-row">
        <a className="brand" href="#/" aria-label={`Best Email Builder — ${text.home}`}>
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
        <LanguagePicker label={text.language} locale={locale} setLocale={setLocale} />
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
            <ul key={copy} className="marquee-list" aria-hidden={copy === 1 ? 'true' : undefined}>
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

function Landing({ text, locale }) {
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
          <CodeSample text={text} locale={locale} />
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

/**
 * Pages 2 and 3 in the same window, under a small control bar: where you are
 * (bank → editor) and a button that spreads the window over the whole screen,
 * then puts it back.
 */
function DemoWindow({ text, step, expanded, setExpanded, children }) {
  useEffect(() => {
    if (!expanded) return undefined;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // Esc leaves full screen, unless it is meant for something inside: a field
    // (the search clears with it) or a dialog (it closes with it).
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded, setExpanded]);

  const label = expanded ? text.shrink : text.expand;
  const Icon = expanded ? Minimize2 : Maximize2;
  return (
    <div className={expanded ? 'demo-frame is-expanded' : 'demo-frame'} data-testid="demo-window">
      <div className="demo-frame-bar">
        <ol className="demo-frame-steps">
          <li aria-current={step === 1 ? 'step' : undefined}>
            <span>1</span>
            {text.stepBank}
          </li>
          <li aria-current={step === 2 ? 'step' : undefined}>
            <ChevronRight aria-hidden="true" />
            <span>2</span>
            {text.stepEditor}
          </li>
        </ol>
        <button type="button" className="demo-frame-toggle" onClick={() => setExpanded(!expanded)} title={label} aria-label={label}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      </div>
      <section className="window" aria-label={text.demo}>
        {children}
      </section>
    </div>
  );
}

function App() {
  const [locale, setLocale] = useState(() => initialLocale(Object.keys(TEXT)));
  const text = TEXT[locale];
  const chooseLocale = useCallback((code) => {
    rememberLocale(code);
    setLocale(code);
  }, []);
  // The storage and the AI module live as long as the page.
  const storage = useMemo(() => createDemoStorage(), []);
  const ai = useMemo(() => createBrowserAi(), []);
  const aiConnected = useSyncExternalStore(ai.key.subscribe, () => ai.key.state().connected);
  // An API of one's own may need no key: then there is none to forget.
  const aiHasKey = useSyncExternalStore(ai.key.subscribe, () => Boolean(ai.key.get()));
  const aiProvider = useSyncExternalStore(ai.key.subscribe, () => ai.key.provider.name);
  const aiModel = useSyncExternalStore(ai.key.subscribe, () => ai.key.model());
  const [route, navigate] = useHashRoute();
  /** The template to select when coming back to the bank. */
  const [lastId, setLastId] = useState(null);
  /** Pages 2 and 3 spread over the whole screen (kept from one to the other). */
  const [expanded, setExpanded] = useState(false);
  /** The template an editor session was saved as: {key: what the route opened, id}. */
  const [savedAs, setSavedAs] = useState(null);
  const pageRef = useRef(null);
  usePointerGlow(pageRef);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (route.page === 'home') setExpanded(false);
  }, [route.page]);

  // Which template the editor opens. After a first save the address already
  // names the new template (replaceState, so no remount): a later remount —
  // switching the language — must reopen that template, not the blank or the
  // base it started from (that would save a duplicate).
  const editorKey = route.templateId ?? route.baseId ?? 'new';
  const savedId = savedAs?.key === editorKey ? savedAs.id : null;
  const base =
    route.page === 'editor' && route.baseId && savedId == null
      ? buildGallery({ templates: TEMPLATE_GALLERY, sender: SENDER, t: translatorFor(locale) }).find((b) => b.id === route.baseId)
      : null;
  const inWindow = route.page === 'templates' || route.page === 'editor';

  return (
    <div className={`landing page-${route.page}`} ref={pageRef}>
      <div className="backdrop" aria-hidden="true" />
      <TopBar text={text} locale={locale} setLocale={chooseLocale} crumb={inWindow ? text.demo : null} />
      {inWindow ? (
        <main className="wrap wrap-wide bank">
          <DemoWindow text={text} step={route.page === 'editor' ? 2 : 1} expanded={expanded} setExpanded={setExpanded}>
            {route.page === 'editor' ? (
              // Level 2: the editor. The bank only hands it a template.
              <EmailBuilder
                key={`${editorKey}-${locale}`}
                storage={storage}
                ai={ai}
                templateId={savedId ?? route.templateId ?? null}
                initialMjml={base?.mjml}
                initialMeta={base ? { subject: base.subject, preheader: base.preheader } : undefined}
                locale={locale}
                sender={SENDER}
                // The bases are picked in the bank (step 1), not again in the editor.
                templates={[]}
                onSaved={(template) => {
                  if (template?.id == null) return;
                  setLastId(template.id);
                  setSavedAs({ key: editorKey, id: template.id });
                  // The address follows the saved template (a reload reopens it) without
                  // a hashchange, which would remount the editor.
                  window.history.replaceState(null, '', `#/editor/${encodeURIComponent(template.id)}`);
                }}
                onClose={() => navigate('/templates')}
              />
            ) : (
              // Level 1: the template bank.
              <TemplateLibrary
                storage={storage}
                locale={locale}
                sender={SENDER}
                selectedId={lastId}
                onClose={() => navigate('/')}
                onEdit={(template) => {
                  setLastId(template.id);
                  navigate(`/editor/${encodeURIComponent(template.id)}`);
                }}
                onCreate={(start) =>
                  navigate(start?.baseId ? `/editor/base/${encodeURIComponent(start.baseId)}` : '/editor/new')
                }
              />
            )}
          </DemoWindow>
          <p className="note">
            <Info aria-hidden="true" />
            <span>{text.note}</span>
          </p>
          <p className="note" data-testid="demo-ai-note">
            <Sparkles aria-hidden="true" />
            <span>
              {text.aiNote}
              {aiConnected && <> {text.aiConnected.replace('{provider}', aiProvider).replace('{model}', aiModel)}</>}
              {/* The Connect dialog belongs to the editor: changing is offered there. */}
              {route.page === 'editor' && (
                <>
                  {' '}
                  <button type="button" className="note-link" onClick={() => ai.key.request()}>
                    {text.aiChange}
                  </button>
                </>
              )}
              {aiConnected && aiHasKey && (
                <>
                  {route.page === 'editor' ? ' · ' : ' '}
                  <button type="button" className="note-link" onClick={() => ai.key.forget()}>
                    {text.aiForget}
                  </button>
                </>
              )}
            </span>
          </p>
        </main>
      ) : (
        <Landing text={text} locale={locale} />
      )}
      <Footer text={text} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
