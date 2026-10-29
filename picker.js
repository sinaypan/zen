// La baguette : injectée dans la page quand on la demande. Le survol encadre
// un élément, un clic le masque et enregistre son adresse pour ce site
// (apply.js fait le reste, ici et aux visites suivantes).
(() => {
  // Deuxième appel pendant qu'elle est déjà en main : on la repose.
  if (globalThis.zenPickerStop) {
    globalThis.zenPickerStop();
    return;
  }

  const KEY = `site:${location.hostname.replace(/^www\./, '')}`;

  // Textes dans la langue de Chrome (_locales), pluriels selon la règle de la langue.
  // Script injecté dans la page : il n'utilise pas i18n.js, qui touche au document.
  const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;
  const plurals = new Intl.PluralRules(chrome.i18n.getUILanguage());
  const tp = (key, count, ...subs) =>
    chrome.i18n.getMessage(`${key}_${plurals.select(count)}`, [count, ...subs].map(String)) || t(`${key}_other`, count, ...subs);

  const KINDS = { iframe: 'kindIframe', img: 'kindImage', picture: 'kindImage', video: 'kindVideo', aside: 'kindAside', header: 'kindHeader', footer: 'kindFooter', nav: 'kindNav', dialog: 'kindDialog', form: 'kindForm', button: 'kindButton', a: 'kindLink', ul: 'kindList', ol: 'kindList', li: 'kindRow', article: 'kindArticle', p: 'kindText' };

  const CSS_TEXT = `
    :host {
      --card: #ffffff;
      --text: #1c1c1e;
      --muted: #8e8e93;
      --field: #f2f2f7;
      --accent: #1fa35a;
      --accent-text: #ffffff;
      --shadow: 0 10px 30px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(60, 60, 67, 0.12);
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --card: #2c2c2e;
        --text: #f2f2f7;
        --field: #3a3a3c;
        --accent: #30d158;
        --accent-text: #1c1c1e;
        --shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(235, 235, 245, 0.12);
      }
    }
    .shield {
      position: fixed;
      inset: 0;
      pointer-events: auto;
      cursor: crosshair;
    }
    .box {
      position: fixed;
      box-sizing: border-box;
      border: 2px solid var(--accent);
      border-radius: 8px;
      background: color-mix(in srgb, var(--accent) 16%, transparent);
      pointer-events: none;
    }
    .box.also {
      border-style: dashed;
    }
    .tag {
      position: fixed;
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-text);
      font: 600 12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
      white-space: nowrap;
      pointer-events: none;
    }
    .bar {
      position: fixed;
      left: 50%;
      top: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: calc(100vw - 24px);
      padding: 8px 8px 8px 16px;
      transform: translateX(-50%);
      border-radius: 999px;
      background: var(--card);
      color: var(--text);
      font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: var(--shadow);
      pointer-events: auto;
      cursor: default;
    }
    .bar.low {
      top: auto;
      bottom: 20px;
    }
    .bar .side {
      display: flex;
      margin-left: -8px;
      padding: 7px;
      background: none;
      color: var(--muted);
    }
    .bar .side:hover {
      background: var(--field);
      color: var(--text);
    }
    .side svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .message {
      margin-right: 6px;
      font-weight: 600;
      white-space: nowrap;
    }
    .hint {
      color: var(--muted);
      font-weight: 400;
    }
    button {
      flex: none;
      margin: 0;
      padding: 7px 14px;
      border: 0;
      border-radius: 999px;
      background: var(--field);
      color: var(--text);
      font: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    button.main {
      background: var(--accent);
      color: var(--accent-text);
      font-weight: 600;
    }
    button.more {
      background: color-mix(in srgb, var(--accent) 22%, var(--field));
      font-weight: 600;
    }
    [hidden] {
      display: none !important;
    }
  `;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const host = document.createElement('div');
  host.style.cssText = 'all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;';
  // Fermé : la page ne peut ni lire ni piloter la baguette.
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS_TEXT);
  root.adoptedStyleSheets = [sheet];

  // Une vitre posée sur toute la page : c'est elle qui reçoit la souris. Sans
  // elle, un clic sur un cadre venu d'un autre site (pub, lecteur vidéo) lui
  // parviendrait directement, et un site qui écoute avant nous réagirait.
  const shield = element('div', 'shield');
  const box = element('div', 'box');
  const tag = element('div', 'tag');
  const others = element('div', 'others');
  const message = element('span', 'message');
  const undoButton = element('button', '', t('undo'));
  const moreButton = element('button', 'more');
  const doneButton = element('button', 'main', t('done'));
  // La barre couvre forcément un bout de page : ce bouton l'envoie de l'autre côté.
  const sideButton = element('button', 'side');
  sideButton.title = t('moveBar');
  sideButton.setAttribute('aria-label', sideButton.title);
  const arrows = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrows.setAttribute('viewBox', '0 0 16 16');
  const strokes = document.createElementNS(arrows.namespaceURI, 'path');
  strokes.setAttribute('d', 'M5 6l3-3 3 3M5 10l3 3 3-3');
  arrows.append(strokes);
  sideButton.append(arrows);
  const bar = element('div', 'bar');
  bar.append(sideButton, message, moreButton, undoButton, doneButton);
  root.append(shield, others, box, tag, bar);

  let target = null; // l'élément encadré
  let trail = []; // de l'élément pointé à ses parents, pour élargir avec ↑
  let depth = 0;
  let pointer = null; // dernière position connue de la souris
  const history = []; // identifiants des règles ajoutées, pour annuler
  let offer = null; // { ruleId, selector, count } : proposition « les semblables »

  const kind = (node) => t(KINDS[node.localName] ?? 'kindBlock');

  // L'étiquette de visée : le genre d'élément et sa taille.
  const describe = (node) => {
    const rect = node.getBoundingClientRect();
    return `${kind(node)} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  };

  const FIELD = 'input:not([type="hidden"]), textarea, [contenteditable=""], [contenteditable="true"]';

  // Sans texte : ce que dit l'image ou le cadre qu'il contient, sinon le site
  // d'où vient ce contenu (une régie de pub, un lecteur vidéo).
  const hintOf = (node) => {
    const media = node.matches('iframe, img, video') ? node : node.querySelector('iframe, img, video');
    const said = [node.getAttribute('aria-label'), media?.getAttribute('alt'), media?.getAttribute('title')].find((value) => value?.trim());
    if (said) return said.replace(/\s+/g, ' ').trim();
    try {
      const from = new URL(media.currentSrc || media.src).hostname.replace(/^www\./, '');
      return from && from !== location.hostname.replace(/^www\./, '') ? from : '';
    } catch {
      return '';
    }
  };

  // Le nom gardé dans la liste du site : le début du texte de l'élément, pour
  // le reconnaître plus tard. Sans texte (une image, un cadre), sa taille.
  const nameOf = (node) => {
    const written = (node.innerText ?? '').replace(/\s+/g, ' ').trim();
    // Une barre de saisie n'a presque pas de texte à elle : son invite la décrit mieux.
    const field = written.length < 25 ? (node.matches(FIELD) ? node : node.querySelector(FIELD)) : null;
    const invite = ['placeholder', 'data-placeholder', 'aria-label'].map((name) => field?.getAttribute(name)?.trim()).find(Boolean);
    const text = invite || written || hintOf(node);
    if (!text) return describe(node);
    // Un texte très court (« Publicité ») revient souvent : la taille aide à les distinguer.
    if (text.length < 16) return `${kind(node)} · ${text} · ${describe(node).split(' · ')[1]}`;
    return `${kind(node)} · ${text.length > 42 ? `${text.slice(0, 40)}…` : text}`;
  };

  const place = (frame, rect) => {
    frame.style.left = `${rect.left}px`;
    frame.style.top = `${rect.top}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
  };

  const draw = () => {
    box.hidden = tag.hidden = !target;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    place(box, rect);
    tag.textContent = describe(target);
    tag.style.left = `${Math.max(4, rect.left)}px`;
    tag.style.top = `${rect.top >= 26 ? rect.top - 24 : Math.min(rect.bottom + 4, innerHeight - 24)}px`;
  };

  const render = () => {
    const count = history.length;
    message.replaceChildren(
      count ? tp('hiddenCount', count) : t('clickWhat'),
      element('span', 'hint', count ? '' : `  ${t('aimWider')}`),
    );
    undoButton.disabled = !count;
    moreButton.hidden = !offer;
    if (offer) moreButton.textContent = tp('alsoSimilar', offer.count - 1);
    draw();
  };

  // Les éléments que la proposition « les semblables » masquerait, en pointillé.
  const preview = (shown) => {
    others.replaceChildren();
    if (!shown || !offer) return;
    for (const node of zenSelector.find(offer.selector).slice(0, 60)) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const frame = element('div', 'box also');
      place(frame, rect);
      others.append(frame);
    }
  };

  const readSite = async () => (await chrome.storage.local.get(KEY))[KEY] ?? { enabled: true, rules: [] };
  // Les modifications se suivent : deux clics rapides ne doivent pas s'écraser.
  let saving = Promise.resolve();
  const updateSite = (change) => {
    saving = saving.then(async () => {
      const site = await readSite();
      change(site);
      await chrome.storage.local.set({ [KEY]: site });
    });
    return saving;
  };

  // Un grand élément posé par-dessus la page (bandeau, mur) : le site bloque
  // souvent le défilement tant qu'il est là.
  const blocksScroll = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const covers = rect.width * rect.height >= innerWidth * innerHeight * 0.4;
    const locked = [document.documentElement, document.body].some((page) => page && getComputedStyle(page).overflowY === 'hidden');
    return covers && locked && ['fixed', 'absolute', 'sticky'].includes(style.position);
  };

  const hide = (node) => {
    const { selector, quality } = zenSelector.build(node);
    const alike = zenSelector.similar(node);
    const rule = { id: crypto.randomUUID(), selector, quality, label: nameOf(node), created: Date.now() };
    const unlock = blocksScroll(node);
    history.push(rule.id);
    offer = alike && alike.selector !== selector ? { ruleId: rule.id, ...alike } : null;
    target = null;
    trail = [];
    updateSite((site) => {
      site.enabled = true;
      site.rules.push(rule);
      if (unlock) site.unlockScroll = true;
    });
    render();
  };

  const undo = () => {
    const id = history.pop();
    if (!id) return;
    if (offer?.ruleId === id) offer = null;
    preview(false);
    updateSite((site) => {
      site.rules = site.rules.filter((rule) => rule.id !== id);
    });
    render();
  };

  // Remplace la règle du dernier clic par celle qui masque aussi les semblables.
  const hideAlike = () => {
    if (!offer) return;
    const { ruleId, selector, count } = offer;
    offer = null;
    preview(false);
    updateSite((site) => {
      const rule = site.rules.find((entry) => entry.id === ruleId);
      if (!rule) return;
      rule.selector = selector;
      rule.quality = 'stable';
      rule.label = `${count} × ${rule.label}`;
    });
    render();
  };

  // La vitre est au-dessus : on prend le premier élément de la page dessous.
  const under = (x, y) => {
    const node = document.elementsFromPoint(x, y).find((found) => found !== host);
    return !node || node === document.documentElement || node === document.body ? null : node;
  };

  // L'élément dessine-t-il lui-même quelque chose : un fond, un bord, une ombre, une image ?
  const paints = (node) => {
    if (node.matches('img, picture, video, iframe, canvas, embed, object')) return true;
    const style = getComputedStyle(node);
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((edge) => parseFloat(style[`border${edge}Width`]) > 0);
    return border || style.backgroundImage !== 'none' || style.boxShadow !== 'none' || !/(,|\/)\s*0\)$|^transparent$/.test(style.backgroundColor);
  };
  // Une barre, un bouton, un bandeau : pas la page entière ni une grande colonne.
  const compact = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.height <= 320 && rect.width * rect.height <= innerWidth * innerHeight * 0.2;
  };
  const area = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.width * rect.height;
  };

  // De l'élément pointé à ses parents, et celui qu'on encadre d'abord. Ce qui
  // est sous la souris est souvent un morceau invisible du bloc que l'on voit :
  // la zone de saisie d'une barre de recherche, le texte d'un bandeau. On part
  // donc du bloc visible, et ↓ permet de redescendre au morceau.
  const pickFrom = (node) => {
    const chain = [];
    // Sans les enveloppes qui n'occupent aucune place (display: contents) : rien à encadrer.
    for (let current = node; current && current !== document.body && current !== document.documentElement; current = current.parentElement) {
      if (current === node || current.getClientRects().length) chain.push(current);
    }
    const at = (found) => Math.max(0, chain.indexOf(found));
    let start = 0;
    const control = node.closest('a[href], button, [role="button"], summary');
    if (control) {
      start = at(control); // un lien ou un bouton : lui, pas la barre qui le contient
    } else {
      start = at(node.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], svg') ?? node);
      if (!paints(chain[start])) {
        const shell = chain.slice(start + 1, start + 9).find(paints);
        if (shell && compact(shell)) start = at(shell);
      }
    }
    // Les enveloppes à peine plus grandes : masquer l'image sans son cadre
    // laisserait le cadre, et une pub sans son enveloppe laisserait la mention « Publicité ».
    const limit = area(chain[start]) * 1.35;
    while (chain[start + 1] && area(chain[start + 1]) <= limit) start++;
    return { chain, start };
  };

  // Vu de la page, la vitre et la barre sont le même élément : on les départage
  // par la position. Un clic sans souris vient du clavier, donc d'un bouton.
  const fromBar = (event) => {
    if (event.target !== host) return false;
    if (event.type === 'click' && event.detail === 0) return true;
    const rect = bar.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };
  const swallow = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  let moved = null; // dernier mouvement de souris reçu, pas encore traité
  let frame = 0;
  const aim = () => {
    frame = 0;
    if (moved) pointer = fromBar(moved) ? null : { x: moved.clientX, y: moved.clientY };
    moved = null;
    const node = pointer ? under(pointer.x, pointer.y) : null;
    // Même élément sous la souris : on garde l'élargissement choisi avec ↑ ↓.
    if (node !== (trail[0] ?? null)) {
      const picked = node ? pickFrom(node) : { chain: [], start: 0 };
      trail = picked.chain;
      depth = picked.start;
    }
    target = trail[depth] ?? null;
    draw();
  };

  // Une souris envoie bien plus de mouvements que l'écran n'affiche d'images :
  // on vise une fois par image, pas une fois par mouvement.
  const aimSoon = () => {
    frame ||= requestAnimationFrame(aim);
  };
  // Avant d'agir (clic, flèche) : viser tout de suite si un mouvement attend.
  const settle = () => {
    if (!frame) return;
    cancelAnimationFrame(frame);
    aim();
  };

  // Seuls les gestes de la vraie souris et du vrai clavier comptent : une page
  // ne doit pas pouvoir faire masquer quoi que ce soit en imitant un clic.
  const onMove = (event) => {
    if (!event.isTrusted) return;
    moved = event;
    aimSoon();
  };

  // La vitre arrête la molette : la page défile quand même d'elle-même, mais
  // pas une liste qui a son propre défilement. On la fait défiler à la main.
  const onWheel = (event) => {
    if (event.ctrlKey || fromBar(event)) return;
    const scale = event.deltaMode === 1 ? 40 : 1;
    const below = document.elementsFromPoint(event.clientX, event.clientY).find((found) => found !== host);
    for (let node = below; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (!/auto|scroll|overlay/.test(style.overflowX + style.overflowY)) continue;
      const [left, top] = [node.scrollLeft, node.scrollTop];
      node.scrollBy({ left: event.deltaX * scale, top: event.deltaY * scale, behavior: 'instant' });
      if (node.scrollLeft !== left || node.scrollTop !== top) {
        event.preventDefault();
        return;
      }
    }
  };

  const onClick = (event) => {
    if (!event.isTrusted || fromBar(event)) return;
    swallow(event);
    settle();
    if (target) hide(target);
  };

  // La page ne doit pas réagir aux clics tant que la baguette est en main.
  const onPress = (event) => {
    if (!fromBar(event)) swallow(event);
  };

  const onKey = (event) => {
    if (!event.isTrusted) return;
    settle();
    if (event.key === 'Escape') stop();
    else if (event.key === 'ArrowUp' && depth < trail.length - 1) target = trail[++depth];
    else if (event.key === 'ArrowDown' && depth > 0) target = trail[--depth];
    else if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) undo();
    else return;
    swallow(event);
    draw();
  };

  const PRESSES = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick', 'contextmenu'];
  const stop = () => {
    removeEventListener('mousemove', onMove, true);
    removeEventListener('click', onClick, true);
    removeEventListener('keydown', onKey, true);
    removeEventListener('scroll', aimSoon, true);
    cancelAnimationFrame(frame);
    removeEventListener('wheel', onWheel, { capture: true });
    removeEventListener('resize', draw, true);
    for (const type of PRESSES) removeEventListener(type, onPress, true);
    host.remove();
    delete globalThis.zenPickerStop;
  };
  globalThis.zenPickerStop = stop;

  sideButton.addEventListener('click', () => bar.classList.toggle('low'));
  undoButton.addEventListener('click', undo);
  doneButton.addEventListener('click', stop);
  moreButton.addEventListener('click', hideAlike);
  moreButton.addEventListener('mouseenter', () => preview(true));
  moreButton.addEventListener('mouseleave', () => preview(false));

  addEventListener('mousemove', onMove, true);
  addEventListener('click', onClick, true);
  addEventListener('keydown', onKey, true);
  // Après un défilement, ce n'est plus le même élément sous la souris.
  addEventListener('scroll', aimSoon, true);
  addEventListener('wheel', onWheel, { capture: true, passive: false });
  addEventListener('resize', draw, true);
  for (const type of PRESSES) addEventListener(type, onPress, true);

  document.documentElement.append(host);
  // Couche supérieure du navigateur : au-dessus des fenêtres modales de la page.
  try {
    host.popover = 'manual';
    host.showPopover();
  } catch {
    // popover indisponible : le z-index suffit
  }
  render();
})();
