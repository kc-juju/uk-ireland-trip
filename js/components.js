/* UI layer: turns trusted itinerary data into the page shell. */
(function () {
    function renderHero(hero, navigation) {
        const summary = hero.summary?.length ? `<div class="trip-summary" aria-label="旅程主題">${hero.summary.map(item => `<div class="summary-pill">${item}</div>`).join('')}</div>` : '';
        const nav = navigation.map(item => `<button type="button" data-hub="${item.id}">${item.label}</button>`).join('');
        return `
<header class="hero">
    <div class="hero-inner">
        <div class="hero-copy">
            <div class="eyebrow">${hero.eyebrow}</div>
            <h1><span>${hero.region}</span>${hero.title}</h1>
            <p>${hero.subtitle}</p>
            ${summary}
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

    function renderJourneyMap(journey) {
        const days = journey.highlandsDays.map(day => `<button type="button" data-map-day="${day.id}">${day.label}<small>${day.drive}</small></button>`).join('');
        return `<section id="journey-map-center" class="journey-map-center"><div class="map-page-intro"><div><div class="eyebrow">OUR HONEYMOON JOURNEY</div><h2>從台北出發，一路寫成地圖。</h2><p>Flights · Train · Highlands Road Trip · Coach · Home</p></div><button type="button" class="map-summary-toggle" aria-expanded="true">Journey Summary</button></div><div class="map-journey-summary"><span>Taipei</span><i>→</i><span>Seoul</span><i>→</i><span>Doha</span><i>→</i><span>Manchester</span><i>→</i><span>Edinburgh</span><i>→</i><span>Fort William</span><i>→</i><span>Isle of Skye</span><i>→</i><span>Fort Augustus</span><i>→</i><span>Glasgow</span><i>→</i><span>Nottingham</span><i>→</i><span>Manchester</span><i>→</i><span>Belfast</span><i>→</i><span>Dublin</span><i>→</i><span>Doha</span><i>→</i><span>Bangkok</span><i>→</i><span>Taipei</span></div><div class="map-layout"><aside class="map-sidebar"><div class="eyebrow">HIGHLANDS ROAD TRIP</div><h2>Drive the Highlands</h2><p>Choose a day to focus the route.</p><button type="button" class="map-day active" data-map-day="all">All journey</button><button type="button" class="map-day" data-map-day="today">Today</button>${days}</aside><section class="map-stage"><div class="map-filter-chips" role="group" aria-label="Map filters"><button class="active" data-map-filter="all">All</button><button data-map-filter="today">Today</button><button data-map-filter="attraction">Attractions</button><button data-map-filter="hotel">Hotels</button><button data-map-filter="food">Food</button><button data-map-filter="driving">Driving</button><button data-map-filter="saved">Saved</button></div><div id="journey-leaflet-map" aria-label="Interactive honeymoon journey map"><div class="map-fallback">Loading journey map…</div></div><article class="location-sheet" aria-live="polite"><button type="button" class="sheet-close" aria-label="Close location details">×</button><div class="sheet-icon">⌖</div><div class="sheet-copy"><span class="sheet-type">SELECT A PLACE</span><h3>Our Honeymoon Journey</h3><p>Tap a marker to see the day, plan and navigation link.</p><div class="sheet-actions"><button type="button" data-map-view-day disabled>View Day</button><a data-map-google hidden target="_blank" rel="noopener">Open in Google Maps</a></div></div></article></section></div></section>`;
    }

    function renderTravelControl(travel) {
        const route = (stops, label) => `<div class="journey-line"><span>${label}</span>${stops.map(stop => `<b>${stop}</b>`).join('<i>↓</i>')}</div>`;
        const flights = travel.flights.map(flight => `<article class="travel-flight-card"><div class="travel-flight-head"><span>${flight.code}</span><small>${flight.airline}</small></div><h3>${flight.from} → ${flight.to}</h3><p>${flight.route}</p><div class="travel-flight-time"><b>${flight.time.split(' → ')[0]}</b><i>→</i><b>${flight.time.split(' → ')[1]}</b></div><div class="travel-flight-meta"><span>${flight.duration}</span><span>${flight.cabin}</span><span>${flight.aircraft}</span></div><details><summary>Flight detail</summary><ul>${flight.detail.map(item => `<li>${item}</li>`).join('')}</ul>${flight.code === 'QR863' || flight.code === 'QR27' ? '<a class="map-link" href="qatar-dining-guide.html">Open Qatar dining guide ↗</a>' : ''}</details></article>`).join('');
        const connections = travel.connections.map(connection => `<article class="connection-card"><h3>⏱ ${connection.duration} Connection</h3><dl><div><dt>Airport</dt><dd>${connection.airport}</dd></div><div><dt>Terminal</dt><dd>${connection.terminal}</dd></div><div><dt>Lounge</dt><dd>${connection.lounge}</dd></div><div><dt>Next flight</dt><dd>${connection.next}</dd></div></dl><p><b>Recommended:</b> ${connection.actions}</p></article>`).join('');
        const trains = travel.trains.map(train => `<article class="transport-row"><span>🚆</span><div><b>${train.route}</b><small>${train.time} · ${train.status}</small><p>${train.note}</p></div></article>`).join('');
        const transfers = travel.transfers.map(item => `<li>${item}</li>`).join('');
        return `<section id="travel-control-center" class="travel-control-center"><div class="travel-page-intro"><div><div class="eyebrow">TRAVEL CONTROL CENTER</div><h2>每一段移動，都在這裡。</h2><p>Flights · Trains · Rental Car · Transfers · Airports · Lounges</p></div><span>2026<br><small>HONEYMOON</small></span></div><section class="journey-timelines" aria-label="Flight overview">${route(travel.outbound, 'OUTBOUND')} ${route(travel.return, 'RETURN')}</section><section class="travel-section"><div class="travel-section-heading"><div><div class="eyebrow">FLIGHT OVERVIEW</div><h2>Flight control</h2></div><span>${travel.flights.length} FLIGHTS</span></div><div class="travel-flight-grid">${flights}</div></section><section class="travel-section"><div class="travel-section-heading"><div><div class="eyebrow">CONNECTIONS</div><h2>Long layovers, planned</h2></div></div><div class="connection-grid">${connections}</div></section><section class="travel-operations"><article class="rental-card"><div class="eyebrow">RENTAL CAR</div><h2>🚗 ${travel.rental.company}</h2><div class="rental-times"><div><span>PICKUP</span><b>${travel.rental.pickup}</b></div><div><span>RETURN</span><b>${travel.rental.return}</b></div></div><ul>${travel.rental.facts.map(item => `<li>${item}</li>`).join('')}</ul></article><article class="train-transfer-card"><div class="eyebrow">RAIL & TRANSFERS</div><h2>🚆 Ground connections</h2>${trains}<ul class="transfer-list">${transfers}</ul></article></section><p class="travel-data-note">Airport terminal, lounge and seat details are shown only where recorded in the itinerary. Unconfirmed fields stay marked as such.</p></section>`;
    }


    function renderWeatherControl() {
        return `<section id="weather-control-center" class="weather-control-center" aria-live="polite">
            <header class="weather-page-intro">
                <div><div class="eyebrow">TRAVEL WEATHER</div><h2>天氣，如何影響今天？</h2><p>Weather translated into travel decisions.</p></div>
                <span>2026<br><small>HONEYMOON</small></span>
            </header>
            <section class="weather-loading-card"><span>☼</span><div><b>Preparing your travel weather…</b><p>Reading the current itinerary and forecast.</p></div></section>
        </section>`;
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
        renderDiningGuide,
        renderTravelControl,
        renderJourneyMap,
        renderWeatherControl
    };
}());
