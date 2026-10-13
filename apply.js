// Chargé au tout début de chaque page : masque ce qui a été retiré sur ce site
// lors des visites précédentes. Une règle de style suffit : tout élément qui y
// correspond est caché dès qu'il arrive dans la page, même chargé plus tard,
// sans rien surveiller.
(() => {
  const KEY = `site:${location.hostname.replace(/^www\./, '')}`;
  const HOLD_MS = 150;
  const SHOW_MS = 3500;
  // « display: none » suffit presque toujours. Le reste rattrape les sites dont
  // la mise en forme impose un affichage plus fort que le nôtre : l'élément
  // est alors sorti de la page, invisible et insensible à la souris.
  const GONE = 'display: none !important; visibility: hidden !important; position: absolute !important; clip-path: inset(50%) !important; pointer-events: none !important;';
  // Créées seulement sur les sites où il y a quelque chose à masquer.
  let rules = null;
  let mark = null;
  let current = null; // la liste du site, telle qu'elle est appliquée
  const hold = new CSSStyleSheet();
  hold.replaceSync('html { opacity: 0 !important; }');

  const attach = (sheet) => {
    if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  };
  const detach = (sheet) => {
    if (sheet && document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = document.adoptedStyleSheets.filter((other) => other !== sheet);
  };

  const find = (selector) => {
    try {
      return [...document.querySelectorAll(selector)];
    } catch {
      return [];
    }
  };

  // site : { enabled, unlockScroll, rules: [{ id, selector, label, quality, created, off }] }
  // off : l'élément reste dans la liste mais on le laisse visible.
  const render = (site) => {
    current = site ?? null;
    const active = site && site.enabled !== false ? (site.rules ?? []).filter((rule) => !rule.off) : [];
    if (!active.length) return detach(rules);
    rules ??= new CSSStyleSheet();
    while (rules.cssRules.length) rules.deleteRule(0);
    for (const rule of active) {
      try {
        // Une règle par élément : une adresse devenue invalide n'annule pas les autres.
        rules.insertRule(`${rule.selector} { ${GONE} }`, rules.cssRules.length);
      } catch {
        // adresse refusée par le navigateur : ignorée
      }
    }
    // Un bandeau retiré laisse souvent le défilement de la page bloqué.
    if (site.unlockScroll) rules.insertRule('html, body { overflow: auto !important; }', rules.cssRules.length);
    attach(rules);
  };

  // La liste du site arrive quelques millisecondes après le début de la page.
  // D'ici là rien n'est montré, sinon ce qui doit être masqué apparaîtrait un
  // instant. Si la liste tarde, la page s'affiche quand même.
  attach(hold);
  const release = () => detach(hold);
  const timer = setTimeout(release, HOLD_MS);
  chrome.storage.local
    .get(KEY)
    .then((stored) => render(stored[KEY]))
    .finally(() => {
      clearTimeout(timer);
      release();
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) render(changes[KEY].newValue);
  });

  // Montre où se trouve un élément de la liste : la page défile jusqu'à lui et
  // il est entouré quelques secondes.
  let fading = null;
  const point = (id) => {
    const rule = current?.rules?.find((entry) => entry.id === id);
    const nodes = rule ? find(rule.selector) : [];
    const visible = nodes.filter((node) => node.getClientRects().length);
    if (!visible.length) return nodes.length;
    mark ??= new CSSStyleSheet();
    while (mark.cssRules.length) mark.deleteRule(0);
    mark.insertRule(`${rule.selector} { outline: 3px solid #30d158 !important; outline-offset: -3px !important; }`);
    attach(mark);
    clearTimeout(fading);
    fading = setTimeout(() => detach(mark), SHOW_MS);
    visible[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    return nodes.length;
  };

  // Demandes de la bulle de l'extension, pour la page affichée.
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.zen === 'count') {
      // Combien d'éléments de cette page chaque adresse désigne.
      respond(Object.fromEntries((current?.rules ?? []).map((rule) => [rule.id, find(rule.selector).length])));
    } else if (message?.zen === 'point') {
      // La liste vient de changer : on l'applique avant de chercher l'élément.
      chrome.storage.local.get(KEY).then((stored) => {
        render(stored[KEY]);
        respond(point(message.id));
      });
      return true;
    }
  });
})();
