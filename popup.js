const byId = (id) => document.getElementById(id);
const wand = byId('wand');
const enabled = byId('enabled');
const rulesList = byId('rules');
const hint = byId('hint');
const reset = byId('reset');

let tab = null;
let key = null; // "site:exemple.fr", ou null sur une page que Chrome protège
let site = { enabled: true, rules: [] };
let present = null; // { identifiant: nombre d'éléments sur la page affichée }, si la page a répondu

const save = () => chrome.storage.local.set({ [key]: site });
// Une demande à la page affichée ; sans réponse si Zen n'y est pas encore chargé.
const ask = (message) => chrome.tabs.sendMessage(tab.id, message).catch(() => null);

const EYE = 'M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8zM8 6a2 2 0 100 4 2 2 0 000-4z';
const eyeIcon = (crossed) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', crossed ? `${EYE}M2.5 2.5l11 11` : EYE);
  svg.append(path);
  return svg;
};

const render = () => {
  const count = site.rules.length;
  const hidden = site.rules.filter((rule) => !rule.off).length;
  byId('count').textContent = count ? `${hidden} masqué${hidden > 1 ? 's' : ''}${hidden < count ? ` sur ${count}` : ''}` : '';
  wand.disabled = !key;
  byId('zen').hidden = !key || !count;
  enabled.checked = site.enabled !== false;
  rulesList.hidden = !count;
  reset.hidden = !count;
  rulesList.replaceChildren(
    ...site.rules.map((rule) => {
      const item = document.createElement('li');
      // L'œil : laisser voir cet élément sur la page, ou le masquer de nouveau.
      const eye = Object.assign(document.createElement('button'), { type: 'button', className: 'eye' });
      eye.title = rule.off ? 'Masquer de nouveau' : 'Montrer sur la page';
      eye.setAttribute('aria-label', eye.title);
      eye.setAttribute('aria-pressed', String(Boolean(rule.off)));
      eye.append(eyeIcon(!rule.off));
      eye.addEventListener('click', async () => {
        rule.off = !rule.off;
        await save();
        render();
        if (rule.off) ask({ zen: 'point', id: rule.id });
      });
      const label = document.createElement('span');
      label.textContent = rule.label;
      label.title = rule.selector;
      const absent = present && !present[rule.id];
      item.classList.toggle('absent', Boolean(absent));
      // Fragile : adresse fondée sur la place dans la page, elle peut ne plus tomber juste si le site change.
      const note = absent ? 'pas sur cette page' : rule.quality === 'position' ? 'fragile' : '';
      if (note) label.append(Object.assign(document.createElement('small'), { textContent: `  ${note}` }));
      const restore = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Rétablir' });
      restore.addEventListener('click', () => {
        site.rules = site.rules.filter((entry) => entry.id !== rule.id);
        save();
        render();
      });
      item.append(eye, label, restore);
      return item;
    }),
  );
  hint.hidden = Boolean(count);
  hint.textContent = key
    ? 'Rien n’est masqué sur ce site. Prends la baguette, puis clique sur ce qui te gêne.'
    : 'Chrome ne permet pas de modifier cette page.';
};

wand.addEventListener('click', async () => {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector.js', 'picker.js'] });
    window.close();
  } catch {
    key = null;
    render();
  }
});

enabled.addEventListener('change', () => {
  site.enabled = enabled.checked;
  save();
});

reset.addEventListener('click', () => {
  site.rules = [];
  site.enabled = true;
  site.unlockScroll = false;
  save();
  render();
});

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url = null;
  try {
    url = new URL(tab.url);
  } catch {
    // adresse illisible : page protégée
  }
  if (url && /^https?:$/.test(url.protocol)) {
    const host = url.hostname.replace(/^www\./, '');
    key = `site:${host}`;
    byId('site').textContent = host;
    site = (await chrome.storage.local.get(key))[key] ?? site;
  } else {
    byId('site').textContent = 'Zen';
  }
  render();
  if (!key || !site.rules.length) return;
  present = await ask({ zen: 'count' });
  if (present) render();
})();
