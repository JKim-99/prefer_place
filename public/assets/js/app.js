(function () {
  'use strict';

  const layout = document.getElementById('explore-layout');
  const mapButton = document.getElementById('map-view-button');
  const listButton = document.getElementById('list-view-button');
  const chips = [...document.querySelectorAll('[data-place-category]')];
  const cards = [...document.querySelectorAll('.place-card')];
  const search = document.getElementById('place-search');
  const count = document.getElementById('place-count');
  let category = 'all';

  document.querySelectorAll('.nav-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.setAttribute('aria-label', expanded ? '메뉴 열기' : '메뉴 닫기');
      document.getElementById(button.getAttribute('aria-controls'))?.classList.toggle('is-open', !expanded);
    });
  });

  function setView(view) {
    layout.dataset.view = view;
    mapButton.classList.toggle('is-active', view === 'map');
    listButton.classList.toggle('is-active', view === 'list');
    mapButton.setAttribute('aria-pressed', String(view === 'map'));
    listButton.setAttribute('aria-pressed', String(view === 'list'));
  }

  function filterPlaces() {
    const query = search.value.trim().toLocaleLowerCase('ko');
    let visible = 0;
    cards.forEach((card) => {
      const categoryMatches = category === 'all' || card.dataset.placeCategory === category;
      const textMatches = card.textContent.toLocaleLowerCase('ko').includes(query);
      card.hidden = !(categoryMatches && textMatches);
      if (!card.hidden) visible += 1;
    });
    count.textContent = String(visible);
  }

  mapButton.addEventListener('click', () => setView('map'));
  listButton.addEventListener('click', () => setView('list'));
  chips.forEach((chip) => chip.addEventListener('click', () => {
    category = chip.dataset.placeCategory;
    chips.forEach((item) => {
      const selected = item === chip;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    filterPlaces();
  }));
  search.addEventListener('input', filterPlaces);
})();