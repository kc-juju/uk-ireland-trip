/* State and interaction layer. The itinerary data is rendered before bindings attach. */
(function bootstrapTripApp() {
    const mount = document.getElementById('app');
    if (!mount || !window.TripData || !window.TripComponents) {
        throw new Error('Trip data or UI components are unavailable.');
    }
    mount.innerHTML = window.TripComponents.renderApp(window.TripData);
    const travelMount = document.getElementById('travel-control-mount');
    if (travelMount && window.TripData.meta.travelControl) {
        travelMount.outerHTML = window.TripComponents.renderTravelControl(window.TripData.meta.travelControl);
    }
}());



function showTab(id, button) {

    document.body.classList.toggle('app-itinerary', id !== 'overview');
    if (id === 'overview' && typeof setHubMode === 'function') {
        setHubMode('home');
    }
    if (typeof setActiveHub === 'function') {
        setActiveHub(id === 'overview' ? 'home' : 'itinerary');
    }

    const contents =
        document.querySelectorAll(".tab-content");

    contents.forEach(content => {
        content.classList.remove("active");
        content.setAttribute("aria-hidden", "true");
    }
    );


    const tabs =
        document.querySelectorAll(".tab");

    tabs.forEach(tab =>
        {
            tab.classList.remove("active");
            tab.setAttribute("aria-selected", "false");
        }
    );


    const target =
        document.getElementById(id);

    if (target) {
        target.classList.add("active");
        target.setAttribute("aria-hidden", "false");
    }


    button.classList.add("active");
    button.setAttribute("aria-selected", "true");


    button.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center"
    });


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


// Add tab semantics after the static document is available.
const tabButtons =
    Array.from(document.querySelectorAll(".tab"));

tabButtons.forEach(tab => {
    const match = tab.getAttribute("onclick")?.match(/showTab\('([^']+)'/);
    const panelId = match ? match[1] : null;

    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", tab.classList.contains("active") ? "true" : "false");

    if (panelId) {
        const tabId = `tab-${panelId}`;
        const panel = document.getElementById(panelId);
        tab.id = tabId;
        tab.setAttribute("aria-controls", panelId);
        if (panel) {
            panel.setAttribute("aria-labelledby", tabId);
        }
    }
});

document.querySelectorAll(".tab-content").forEach(panel => {
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("tabindex", "-1");
    panel.setAttribute("aria-hidden", panel.classList.contains("active") ? "false" : "true");
});


document.addEventListener(
    "keydown",
    function(event) {

        if (
            event.target instanceof HTMLElement &&
            (event.target.isContentEditable ||
             ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
        ) {
            return;
        }

        if (
            event.key !== "ArrowLeft" &&
            event.key !== "ArrowRight"
        ) {
            return;
        }

        event.preventDefault();


        const tabs =
            Array.from(
                document.querySelectorAll(".tab")
            );


        const activeIndex =
            tabs.findIndex(
                tab =>
                    tab.classList.contains("active")
            );


        let nextIndex;


        if (event.key === "ArrowRight") {

            nextIndex =
                Math.min(
                    activeIndex + 1,
                    tabs.length - 1
                );

        } else {

            nextIndex =
                Math.max(
                    activeIndex - 1,
                    0
                );

        }


        tabs[nextIndex].click();
        tabs[nextIndex].focus();

    }
);


const tabsContainer =
    document.getElementById("tabs");


tabsContainer.addEventListener(
    "wheel",
    function(event) {

        if (event.deltaY !== 0) {

            event.preventDefault();

            tabsContainer.scrollLeft +=
                event.deltaY;

        }

    },
    {
        passive: false
    }
);


/* Honeymoon journal app navigation and progressive detail layers. */
const appNavButtons = Array.from(document.querySelectorAll('[data-hub]'));
const dayButtons = Array.from(document.querySelectorAll('.tab'));

function setHubMode(hub) {
    document.body.classList.remove('app-hub-home', 'app-hub-itinerary', 'app-hub-map', 'app-hub-travel', 'app-hub-guide', 'app-hub-journal');
    document.body.classList.add(`app-hub-${hub}`);
}

function setActiveHub(hub) {
    appNavButtons.forEach(button => button.classList.toggle('active', button.dataset.hub === hub));
}

function showHub(hub) {
    setHubMode(hub);
    const overviewButton = document.querySelector('.tab[onclick*="overview"]');
    const targetByHub = {
        home: 'home-hub',
        map: 'route-map',
        travel: 'travel-control-center',
        guide: 'guide-hub',
        journal: 'journal-hub'
    };

    if (hub === 'itinerary') {
        const firstDay = document.querySelector('.tab[onclick*="1009"]');
        if (firstDay) showTab('1009', firstDay);
        document.body.classList.add('app-itinerary');
        setActiveHub('itinerary');
        return;
    }

    if (overviewButton) showTab('overview', overviewButton);
    document.body.classList.remove('app-itinerary');
    setHubMode(hub);
    setActiveHub(hub);

    const target = document.getElementById(targetByHub[hub] || 'home-hub');
    if (target) {
        window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    }
}

appNavButtons.forEach(button => button.addEventListener('click', () => showHub(button.dataset.hub)));

document.querySelectorAll('[data-dashboard-target]').forEach(button => {
    button.addEventListener('click', () => {
        showHub('travel');
        const target = document.getElementById(button.dataset.dashboardTarget);
        if (target) window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    });
});

document.querySelectorAll('[data-open-day]').forEach(button => {
    button.addEventListener('click', () => {
        const id = button.dataset.openDay;
        const tab = document.querySelector(`.tab[onclick*="${id}"]`);
        if (tab) {
            showTab(id, tab);
            document.body.classList.add('app-itinerary');
            setActiveHub('itinerary');
        }
    });
});

function getTimelineCategory(title, detail) {
    const text = `${title} ${detail}`.toLowerCase();
    if (/flight|航班|起飛|抵達機場|airport|qr\d|br\d|tg\d|ei\d/.test(text)) return '✈️ Flight';
    if (/train|火車|rail|waverley/.test(text)) return '🚆 Train';
    if (/drive|driving|開車|取車|還車|rental|alamo|car /.test(text)) return '🚗 Driving';
    if (/hotel|airbnb|check-in|住宿|飯店/.test(text)) return '🏨 Hotel';
    if (/lunch|dinner|breakfast|餐|tea rooms|afternoon tea/.test(text)) return '🍽 Food';
    if (/castle|museum|cathedral|palace|causeway|glencoe|skye|university|景點/.test(text)) return '🏰 Attraction';
    if (/forest|arsenal|football|match|球賽/.test(text)) return '⚽ Football';
    if (/shop|shopping|採買/.test(text)) return '🛍 Shopping';
    if (/photo|拍照|sunset|日落/.test(text)) return '📸 Photo';
    return '💍 Honeymoon';
}

function timelineLocation(item, fallback) {
    const map = item.querySelector('.map-link');
    if (map?.textContent.trim()) return map.textContent.trim().replace(/^📍\s*/, '');
    return fallback || 'See today’s route';
}

function enhanceTimelineItems(panel, fallbackLocation) {
    panel.querySelectorAll('.timeline-item').forEach(item => {
        if (item.dataset.timelineReady) return;
        item.dataset.timelineReady = 'true';
        const title = item.querySelector('.event-title');
        const detail = item.querySelector('.event-detail');
        if (!title) return;
        const category = getTimelineCategory(title.textContent, detail?.textContent || '');
        const location = timelineLocation(item, fallbackLocation);
        const meta = document.createElement('div');
        meta.className = 'timeline-meta';
        meta.innerHTML = `<span class="timeline-category">${category}</span><span class="timeline-location">📍 ${location}</span>`;
        title.insertAdjacentElement('afterend', meta);
        if (detail) {
            detail.classList.add('timeline-detail', 'is-collapsed');
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'timeline-detail-toggle';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.textContent = 'Details';
            toggle.addEventListener('click', () => {
                const collapsed = detail.classList.toggle('is-collapsed');
                toggle.textContent = collapsed ? 'Details' : 'Hide details';
                toggle.classList.toggle('is-expanded', !collapsed);
                toggle.setAttribute('aria-expanded', String(!collapsed));
            });
            detail.insertAdjacentElement('beforebegin', toggle);
        }
    });
}

function addDailySummary(panel, presentation) {
    const header = panel.querySelector('.day-header');
    if (!header || panel.querySelector('.daily-summary')) return;
    const firstTimeline = panel.querySelector('.timeline-item');
    const time = firstTimeline?.querySelector('.time')?.textContent.trim() || 'See timeline';
    const title = firstTimeline?.querySelector('.event-title')?.textContent.trim() || presentation.highlight;
    const route = header.querySelector('.route')?.textContent.trim() || '';
    const sun = header.querySelector('.sun-times')?.textContent.trim() || 'Weather: check before departure';
    const summary = document.createElement('section');
    summary.className = 'daily-summary';
    summary.innerHTML = `
        <div class="daily-summary-heading"><div><span>DAILY SUMMARY</span><h3>${presentation.highlight}</h3></div><span class="daily-summary-badge">${getTimelineCategory(title, route)}</span></div>
        <div class="daily-summary-grid">
            <div><small>ROUTE</small><b>${route || title}</b></div>
            <div><small>NEXT</small><b>${time}<br>${title}</b></div>
            <div><small>TONIGHT</small><b>🏨 ${presentation.stay}</b></div>
        </div>
        <div class="daily-summary-weather">🌦 ${sun}</div>
        <div class="daily-highlight"><span>⭐ DAY HIGHLIGHT</span><b>${presentation.highlight}</b></div>
        ${presentation.moment ? `<div class="honeymoon-moment"><span>💍 Honeymoon Moment</span><b>${presentation.moment}</b></div>` : ''}`;
    header.insertAdjacentElement('afterend', summary);
}

function addDailyFooter(panel, presentation) {
    if (panel.querySelector('.daily-footer')) return;
    const header = panel.querySelector('.day-header');
    const weather = header?.querySelector('.sun-times')?.textContent.trim() || 'Check local conditions';
    const footer = document.createElement('footer');
    footer.className = 'daily-footer';
    footer.innerHTML = `
        <div class="daily-footer-facts"><span>🌦 ${weather}</span><span>🚗 ${presentation.driving}</span><span>🏨 ${presentation.stay}</span></div>
        <div class="daily-footer-actions"><button type="button" data-open-route>Open Route</button><button type="button" data-memory-toggle>Add Memory</button></div>
        <div class="memory-panel" hidden><label>Today’s memory<textarea rows="3" placeholder="留下今天的一句回憶…"></textarea></label><button type="button" data-memory-save>Save on this device</button><small></small></div>`;
    footer.querySelector('[data-open-route]').addEventListener('click', () => {
        panel.querySelector('.timeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const memoryPanel = footer.querySelector('.memory-panel');
    const memoryKey = `honeymoon-memory-${panel.id}`;
    const textArea = memoryPanel.querySelector('textarea');
    textArea.value = localStorage.getItem(memoryKey) || '';
    footer.querySelector('[data-memory-toggle]').addEventListener('click', () => {
        memoryPanel.hidden = !memoryPanel.hidden;
        if (!memoryPanel.hidden) textArea.focus();
    });
    footer.querySelector('[data-memory-save]').addEventListener('click', () => {
        localStorage.setItem(memoryKey, textArea.value);
        memoryPanel.querySelector('small').textContent = 'Saved on this device.';
    });
    panel.append(footer);
}

function enhanceDailyPanels() {
    const presentation = window.TripData?.meta?.dailyPresentation || {};
    document.querySelectorAll('.tab-content:not(#overview)').forEach(panel => {
        const header = panel.querySelector('.day-header');
        const route = header?.querySelector('.route')?.textContent.trim() || '';
        const entry = presentation[panel.id] || { highlight: header?.querySelector('h2')?.textContent.trim() || 'Today’s plan', stay: 'See full itinerary', driving: 'See route in timeline' };
        addDailySummary(panel, entry);
        const summary = panel.querySelector('.daily-summary');
        const timelineCards = Array.from(panel.children).filter(child => child.classList?.contains('card') && child.querySelector('.timeline'));
        let timelineAnchor = summary;
        timelineCards.forEach(card => {
            timelineAnchor.insertAdjacentElement('afterend', card);
            timelineAnchor = card;
        });
        enhanceTimelineItems(panel, route);
        addDailyFooter(panel, entry);
        const cards = Array.from(panel.children).filter(child => child.classList?.contains('card'));
        cards.forEach(card => {
            if (card.dataset.progressiveReady || card.querySelector('.timeline')) return;
            card.dataset.progressiveReady = 'true';
            card.classList.add('progressive-card', 'is-collapsed');
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'progressive-toggle';
            toggle.textContent = '展開細節';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.addEventListener('click', () => {
                const collapsed = card.classList.toggle('is-collapsed');
                toggle.textContent = collapsed ? '展開細節' : '收合細節';
                toggle.setAttribute('aria-expanded', String(!collapsed));
            });
            card.append(toggle);
        });
    });
}

enhanceDailyPanels();
document.body.classList.remove('app-itinerary');
setHubMode('home');
setActiveHub('home');
