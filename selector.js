// Trouve l'adresse d'un élément (un sélecteur CSS) qui a des chances de le
// retrouver à la prochaine visite. Beaucoup de sites donnent à leurs éléments
// des noms fabriqués par un outil, qui changent à chaque mise à jour ou à
// chaque chargement : ces noms sont écartés, au profit de ce qui est écrit par
// des humains (identifiants parlants, attributs, structure proche).
// Affectation plutôt que déclaration : le fichier peut être injecté deux fois.
globalThis.zenSelector = (() => {
  const ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-component', 'data-module', 'data-widget', 'data-type', 'data-name', 'aria-label', 'role', 'name', 'itemprop'];
  const MAX_SIMILAR = 200;

  // Un morceau de nom (entre tirets) qui ressemble à du hasard : "x9k2a", "bdVaJa".
  const isRandomSegment = (segment) => {
    if (segment.length < 4) return false;
    const hasLetter = /[a-z]/i.test(segment);
    const hasDigit = /\d/.test(segment);
    // Lettres puis un petit numéro ("item12") ou l'inverse ("2col") : écrit à la main.
    if (hasLetter && hasDigit && !/^[a-z]+\d{1,2}$/i.test(segment) && !/^\d{1,2}[a-z]{1,4}$/i.test(segment)) return true;
    // Majuscules en désordre : "bdVaJa" se coupe en morceaux de deux lettres, "mainContent" non.
    const chunks = segment.split(/(?=[A-Z])/);
    if (chunks.length >= 3 && chunks.filter((chunk) => chunk.length <= 2).length >= 2) return true;
    return segment.length >= 6 && !/[aeiouy]/i.test(segment);
  };

  // Les préfixes que posent les outils qui fabriquent les noms.
  const GENERATED = /^(css|sc|jsx|jss|svelte|emotion)$/i;

  const isRandomToken = (token) => {
    if (token.length < 2 || /[^\w-]/.test(token)) return true; // "a", ":r1:", "w-[23px]"
    if (GENERATED.test(token.split('-')[0]) || /^(css|jss|ember|svelte)\d/i.test(token)) return true;
    // Les dimensions ("300x250") sont parlantes ; les longs numéros désignent un exemplaire précis.
    const bare = token.replace(/\d+x\d+/gi, '');
    if (/\d{3,}/.test(bare)) return true;
    return bare.split(/[-_]+/).some(isRandomSegment);
  };

  // Les noms qui décrivent l'allure ou l'état d'un élément, pas ce qu'il est :
  // "flex", "hidden", "active", "mt-4", "text-center". Ils changent dès que
  // l'élément change d'état, ou désignent demain un tout autre élément.
  const LOOK = /^(is|has)-|^(flex|grid|block|inline|inline-block|inline-flex|contents|relative|absolute|fixed|sticky|static|truncate|italic|underline|uppercase|grow|shrink|group|peer|container|clearfix|row|col|active|current|selected|open|opened|closed|show|shown|visible|invisible|hidden|hide|collapsed|expanded|focus|focused|hover|disabled|loading|loaded|ready|pinned|scrolled|animated|fade|dark|light|first|last|odd|even)$/i;
  const UTILITY = /^-?(m[xytrblse]?|p[xytrblse]?|w|h|min-w|min-h|max-w|max-h|size|gap|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|z|order|basis|items|justify|self|place|leading|tracking|rounded|opacity|overflow|overflow-x|overflow-y|cursor|duration|delay|ease|scale|rotate|translate-x|translate-y|col|row|d|fs|fw|lh|g|text|font|bg|border|shadow|ring|flex|grid|object|transition|align|float|display|position)-(.+)$/i;
  const VALUE = /\d|^(full|screen|auto|none|fit|min|max|px|xs|sm|md|lg|xl|center|start|end|between|around|evenly|stretch|baseline|col|row|column|reverse|wrap|nowrap|hidden|visible|scroll|clip|left|right|top|bottom|middle|white|black|transparent|current|inherit|bold|semibold|medium|normal|light|pointer|default|primary|secondary|muted)$/i;
  const isLook = (name) => LOOK.test(name) || VALUE.test(UTILITY.exec(name)?.at(-1) ?? '_');

  // Les noms « atomiques » fabriqués par un outil, un par règle de style :
  // "x78zum5", "xeuugli". Certains ont l'air de mots ; on les reconnaît en
  // groupe : même première lettre, même forme, et la moitié au hasard.
  const atomic = (classes) => {
    const groups = new Map();
    for (const name of classes) {
      if (/^[a-z][a-z0-9]{4,8}$/.test(name)) groups.set(name[0], [...(groups.get(name[0]) ?? []), name]);
    }
    return new Set([...groups.values()].filter((group) => group.length >= 3 && group.filter(isRandomToken).length * 2 >= group.length).flat());
  };

  // Attributs data-… posés par un outil, ou qui disent un état ou une mesure.
  const TOOLING = /^(v-|react|octane|radix|headlessui|rbd|rsc|hydrat|emotion|styled|sveltekit|astro|turbo|ng-|n-|s-)|^(slot|state|index|id|key|uid|url|href|src|value|position|order|size)$|time|date|count|offset|width|height/i;
  const STATE = /(^|-)(active|open|closed|selected|checked|pressed|expanded|collapsed|focus|focused|hover|disabled|loading|loaded|visible|hidden|highlighted|dragging|theme|mode|orientation|side|align|placement|status|landing|logged)(-|$)/i;

  // Le début stable d'un nom dont la fin change : "Card_root__a1B2c" -> "Card_root__",
  // "div-gpt-ad-1699999-0" -> "div-gpt-ad-".
  const stablePrefix = (token) => {
    if (/[^\w-]/.test(token)) return null;
    const parts = token.split(/([-_]+)/); // morceaux et séparateurs alternés
    let prefix = '';
    for (let i = 0; i < parts.length; i += 2) {
      if (isRandomSegment(parts[i]) || /^\d{3,}$/.test(parts[i]) || /\d{3,}/.test(parts[i].replace(/\d+x\d+/gi, ''))) break;
      prefix += parts[i] + (parts[i + 1] ?? '');
    }
    if (prefix === token || prefix.length < 4 || !/[a-z]{2}/i.test(prefix) || !/[-_]$/.test(prefix)) return null;
    const name = prefix.replace(/[-_]+$/, '');
    return GENERATED.test(name) || isRandomToken(name) ? null : prefix;
  };

  const quote = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  const sourceHost = (element) => {
    try {
      const url = new URL(element.getAttribute('src'), location.href);
      return /^https?:$/.test(url.protocol) && url.host !== location.host ? url.host : null;
    } catch {
      return null;
    }
  };

  // Ce qui désigne un élément sans ambiguïté sur son rôle : identifiant,
  // attribut posé par les développeurs, adresse d'un contenu venu d'ailleurs.
  const strong = (element) => {
    const tag = element.localName;
    const list = [];
    if (element.id) {
      if (!isRandomToken(element.id)) list.push(`#${CSS.escape(element.id)}`);
      else if (stablePrefix(element.id)) list.push(`${tag}[id^=${quote(stablePrefix(element.id))}]`);
    }
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value && value.length <= 80 && !/\d{3,}/.test(value)) list.push(`${tag}[${name}=${quote(value)}]`);
    }
    if (['iframe', 'img', 'video', 'embed'].includes(tag) && sourceHost(element)) list.push(`${tag}[src*=${quote(`//${sourceHost(element)}/`)}]`);
    // Les autres attributs data-… écrits pour nommer un bloc : "data-composer", "data-ad-slot".
    let named = 0;
    for (const { name, value } of element.attributes) {
      if (named >= 3 || !name.startsWith('data-') || ATTRIBUTES.includes(name)) continue;
      const bare = name.slice(5);
      if (TOOLING.test(bare) || STATE.test(bare) || isRandomToken(bare)) continue;
      if (value && (value.length > 40 || /\d{3,}/.test(value) || /^(true|false|\d+)$/.test(value))) continue;
      list.push(value ? `${tag}[${name}=${quote(value)}]` : `${tag}[${name}]`);
      named++;
    }
    return list;
  };

  // Les façons simples de désigner un élément, de la plus sûre à la plus vague.
  const features = (element) => {
    const tag = element.localName;
    const list = strong(element);

    const classes = [...element.classList];
    const generated = atomic(classes);
    const stable = classes.filter((name) => !isRandomToken(name) && !generated.has(name) && !isLook(name)).slice(0, 5);
    // Deux noms ensemble désignent plus précisément qu'un seul.
    for (let i = 0; i < stable.length; i++) {
      for (let j = i + 1; j < stable.length; j++) list.push(`${tag}.${CSS.escape(stable[i])}.${CSS.escape(stable[j])}`);
    }
    for (const name of stable) list.push(`${tag}.${CSS.escape(name)}`);
    for (const name of classes) {
      if (isRandomToken(name) && stablePrefix(name)) list.push(`${tag}[class*=${quote(stablePrefix(name))}]`);
    }
    // Une enveloppe sans nom autour d'un contenu reconnaissable (le cadre d'une pub).
    if (element.children.length <= 3) {
      for (const child of element.children) for (const selector of strong(child)) list.push(`${tag}:has(> ${selector})`);
    }
    list.push(tag);
    return [...new Set(list)];
  };

  const find = (selector) => {
    try {
      return [...document.querySelectorAll(selector)];
    } catch {
      return [];
    }
  };
  const matchesOnly = (selector, element) => {
    try {
      // Le premier trouvé d'abord : la plupart des adresses s'éliminent là, sans parcourir toute la page.
      return document.querySelector(selector) === element && document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };
  // Un clic pose plusieurs fois la question pour les mêmes parents : la réponse
  // est gardée le temps du clic, pas plus (la page peut changer ensuite).
  let known = null;
  const unique = (element) => {
    if (!known) {
      known = new Map();
      queueMicrotask(() => (known = null));
    }
    if (!known.has(element)) known.set(element, features(element).find((selector) => matchesOnly(selector, element)) ?? null);
    return known.get(element);
  };

  // Un élément parmi ses frères : par un nom qu'il est seul à porter, sinon par son rang.
  const step = (element) => {
    const siblings = [...element.parentElement.children];
    const own = features(element).find((selector) => selector !== element.localName && siblings.filter((sibling) => sibling.matches(selector)).length === 1);
    if (own) return own;
    const sameTag = siblings.filter((sibling) => sibling.localName === element.localName);
    return sameTag.length === 1 ? element.localName : `${element.localName}:nth-of-type(${sameTag.indexOf(element) + 1})`;
  };

  // quality : 'stable' si l'adresse repose sur des noms, 'position' si elle
  // repose sur la place de l'élément dans la page (plus fragile).
  const build = (element) => {
    const direct = unique(element);
    if (direct) return { selector: direct, quality: 'stable' };

    // Pas d'adresse propre : on part du plus proche parent qui en a une.
    const path = [step(element)];
    for (let node = element.parentElement; node; node = node.parentElement) {
      const anchor = unique(node);
      if (anchor) {
        const named = features(element).map((selector) => `${anchor} ${selector}`).find((selector) => matchesOnly(selector, element));
        if (named) return { selector: named, quality: 'stable' };
        return { selector: `${anchor} > ${path.join(' > ')}`, quality: 'position' };
      }
      if (!node.parentElement) break;
      path.unshift(step(node));
    }
    return { selector: `html > ${path.join(' > ')}`, quality: 'position' };
  };

  const isShown = (element) => element.getClientRects().length > 0;

  // Même gabarit : des cartes ou des lignes d'une même liste se ressemblent,
  // un bandeau et le contenu de la page non.
  const alike = (element, other) => {
    const [a, b] = [element.getBoundingClientRect(), other.getBoundingClientRect()];
    return Math.abs(a.width - b.width) <= a.width * 0.3 && Math.abs(a.height - b.height) <= a.height * 0.6;
  };

  // Les éléments du même genre que celui-ci (les autres cartes d'une liste,
  // les autres encarts) : l'adresse qui en désigne le moins, mais plus d'un.
  const similar = (element) => {
    const candidates = features(element).filter((selector) => selector !== element.localName);
    if (element.parentElement && element.parentElement !== document.documentElement) {
      candidates.push(`${build(element.parentElement).selector} > ${element.localName}`);
    }
    let best = null;
    for (const selector of candidates) {
      const found = find(selector).filter(isShown);
      if (found.length < 2 || found.length > MAX_SIMILAR || !found.includes(element)) continue;
      if (!found.every((other) => alike(element, other))) continue;
      if (!best || found.length < best.count) best = { selector, count: found.length };
    }
    return best;
  };

  return { build, similar, features, isRandomToken, stablePrefix, find };
})();
