/* UI layer: turns trusted itinerary data into the page shell. */
(function () {
    function renderHero(hero, navigation) {
        const summary = hero.summary.map(item => `<div class="summary-pill">${item}</div>`).join('');
        const nav = navigation.map(item => `<button type="button" data-hub="${item.id}">${item.label}</button>`).join('');
        return `
<header class="hero">
    <div class="hero-inner">
        <div class="hero-copy">
            <div class="eyebrow">${hero.eyebrow}</div>
            <h1><span>${hero.region}</span>${hero.title}</h1>
            <p>${hero.subtitle}</p>
            <div class="trip-summary" aria-label="旅程主題">${summary}</div>
        </div>
        <div class="hero-visual" aria-label="愛丁堡城堡與蘇格蘭高地旅行意象">
            <div class="hero-visual-label">${hero.visualLabel[0]}<br><span>${hero.visualLabel[1]}</span></div>
        </div>
    </div>
    <div class="journal-nav" aria-label="主要頁面">${nav}</div>
</header>`;
    }

    function renderTabs(panels) {
        const tabs = panels.map(panel => `<button class="tab${panel.id === 'overview' ? ' active' : ''}" onclick="showTab('${panel.id}', this)">${panel.label}</button>`).join('');
        return `<div class="tabs-wrapper"><div class="tabs" id="tabs" role="tablist" aria-label="每日行程">${tabs}</div></div>`;
    }

    function renderBottomNavigation(navigation) {
        const items = navigation.map(item => `<button type="button" class="bottom-nav-item${item.id === 'home' ? ' active' : ''}" data-hub="${item.id}"><span>${item.icon}</span><b>${item.label}</b></button>`).join('');
        return `<nav class="bottom-nav" aria-label="主要導覽">${items}</nav>`;
    }

    function renderDiningGuide(data) {
        const meta = data.meta;
        return `<header class="hero"><div class="wrap"><div class="eyebrow">${meta.eyebrow}</div><h1>${meta.title}</h1><p>${meta.subtitle}</p><a class="back" href="index.html">${meta.backLabel}</a></div></header><main class="container">${data.contentHtml}</main>`;
    }

    window.TripComponents = {
        renderApp(data) {
            return `
<a class="skip-link" href="#overview">跳到主要內容</a>
${renderHero(data.meta.hero, data.meta.navigation)}
${renderTabs(data.panels)}
<main class="container">${data.panels.map(panel => panel.html).join('\n')}<div class="footer">${data.meta.footer}</div></main>
${renderBottomNavigation(data.meta.navigation)}`;
        },
        renderDiningGuide
    };
}());
