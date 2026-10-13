// Le raccourci clavier donne la baguette sans passer par la bulle de l'icône.
// Tout le reste se passe dans la page (apply.js, picker.js) et dans la bulle.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'wand' || !tab?.id) return;
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector.js', 'picker.js'] }).catch(() => {
    // page où Chrome n'autorise aucun script (nouvel onglet, chrome://...)
  });
});
