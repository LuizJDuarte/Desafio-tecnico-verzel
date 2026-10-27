(function () {
  try {
    var saved = localStorage.getItem('arremate:theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch {
    /* armazenamento indisponível: segue o tema claro */
  }
})();
