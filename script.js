(function () {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  document.querySelectorAll('[data-year]').forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });

  const copyPage = document.querySelector('#copy-page');
  if (copyPage) {
    copyPage.addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(window.location.href);
        copyPage.textContent = 'Page link copied';
        window.setTimeout(function () { copyPage.textContent = 'Copy page link'; }, 1800);
      } catch {
        copyPage.textContent = 'Copy unavailable';
        window.setTimeout(function () { copyPage.textContent = 'Copy page link'; }, 1800);
      }
    });
  }
}());
