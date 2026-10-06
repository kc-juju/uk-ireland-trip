/* State and interaction layer. The itinerary data is rendered before bindings attach. */
(function bootstrapTripApp() {
    const mount = document.getElementById('app');
    if (!mount || !window.TripData || !window.TripComponents) {
        throw new Error('Trip data or UI components are unavailable.');
    }
    mount.innerHTML = window.TripComponents.renderApp(window.TripData);
    const mapMount = document.getElementById('journey-map-mount');
    if (mapMount && window.TripData.meta.journeyMap) {
        mapMount.outerHTML = window.TripComponents.renderJourneyMap(window.TripData.meta.journeyMap);
    }
    const travelMount = document.getElementById('travel-control-mount');
    if (travelMount && window.TripData.meta.travelControl) {
        travelMount.outerHTML = window.TripComponents.renderTravelControl(window.TripData.meta.travelControl);
    }
    const weatherMount = document.getElementById('weather-control-mount');
    if (weatherMount) weatherMount.outerHTML = window.TripComponents.renderWeatherControl();
}());

function getTripClock(date = new Date()) {
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(2026, 9, 9);
    const end = new Date(2026, 9, 26);
    const msPerDay = 24 * 60 * 60 * 1000;
    if (today < start) {
        return { phase: 'before', day: '1009', daysToGo: Math.ceil((start - today) / msPerDay) };
    }
    if (today > end) return { phase: 'after', day: '1026', dayNumber: 18 };
    const dayNumber = Math.floor((today - start) / msPerDay) + 1;
    return { phase: 'during', day: `10${String(dayNumber + 8).padStart(2, '0')}`, dayNumber };
}

function syncTripDashboard() {
    const clock = getTripClock();
    const home = document.getElementById('home-hub');
    if (!home) return;
    const primary = home.querySelector('.progress-line strong');
    const secondary = home.querySelector('.progress-line span');
    const meter = home.querySelector('.progress-meter');
    const meterFill = meter?.querySelector('span');
    const label = home.querySelector('.home-status-card p');
    const journeyLabel = home.querySelector('.today-journey .eyebrow');
    const journeyHeading = home.querySelector('#today-journey-title');
    const planButtons = home.querySelectorAll('[data-open-day]');
    const locations = home.querySelectorAll('.location-block strong');
    const facts = home.querySelector('.journey-facts');
    const highlight = home.querySelector('.highlight-card');
    const next = home.querySelector('.next-event-card');
    const alertText = home.querySelector('.travel-alert p');
    const setPlanDay = day => planButtons.forEach(button => { button.dataset.openDay = day; });
    const setCard = (card, eyebrow, title, detail) => {
        if (!card) return;
        const cardEyebrow = card.querySelector('.eyebrow');
        const cardTitle = card.querySelector('h2, h3');
        const cardDetail = card.querySelector('p');
        if (cardEyebrow) cardEyebrow.textContent = eyebrow;
        if (cardTitle) cardTitle.textContent = title;
        if (cardDetail) cardDetail.textContent = detail;
    };

    if (clock.phase === 'before') {
        if (primary) primary.textContent = `${clock.daysToGo} DAYS`;
        if (secondary) secondary.textContent = ' / TO GO';
        if (label) label.textContent = 'Countdown to departure';
        if (meter) meter.setAttribute('aria-label', `${clock.daysToGo} days until departure`);
        if (meterFill) meterFill.style.width = '0%';
        if (journeyLabel) journeyLabel.textContent = 'NEXT JOURNEY';
        if (journeyHeading) journeyHeading.textContent = 'Taipei → Seoul';
        if (locations[0]) locations[0].textContent = 'Taipei';
        if (locations[1]) locations[1].textContent = 'Seoul';
        if (facts) facts.innerHTML = '<span>✈️ 10/09</span><span>Long-haul flight begins</span>';
        setCard(highlight, '✈️ HONEYMOON BEGINS', 'Taipei → Seoul', '10/09 · 旅程第一段航班');
        setCard(next, 'NEXT', '✈️ Departure from Taipei', `In ${clock.daysToGo} days`);
        if (alertText) alertText.textContent = `Departure in ${clock.daysToGo} days · check passports and travel essentials`;
        setPlanDay('1009');
        return;
    }
    if (clock.phase === 'after') {
        if (primary) primary.textContent = 'COMPLETE';
        if (secondary) secondary.textContent = ' / 18 DAYS';
        if (label) label.textContent = 'Honeymoon journey complete';
        if (meter) meter.setAttribute('aria-label', 'Honeymoon journey complete');
        if (meterFill) meterFill.style.width = '100%';
        if (journeyLabel) journeyLabel.textContent = 'JOURNEY MEMORY';
        if (journeyHeading) journeyHeading.textContent = 'United Kingdom × Ireland';
        if (locations[0]) locations[0].textContent = 'Taipei';
        if (locations[1]) locations[1].textContent = 'Memories';
        if (facts) facts.innerHTML = '<span>💍 18 DAYS</span><span>Our honeymoon, together</span>';
        setCard(highlight, '💍 HONEYMOON JOURNAL', 'A journey to remember', 'United Kingdom × Ireland · 2026');
        setCard(next, 'MEMORIES', 'Open the travel journal', 'Revisit each day’s route and notes');
        if (alertText) alertText.textContent = 'This honeymoon journey is complete.';
        setPlanDay('1026');
        return;
    }
    if (primary) primary.textContent = `DAY ${String(clock.dayNumber).padStart(2, '0')}`;
    if (secondary) secondary.textContent = ' / 18';
    if (label) label.textContent = 'Trip Progress';
    if (meter) meter.setAttribute('aria-label', `Trip progress: day ${clock.dayNumber} of 18`);
    if (meterFill) meterFill.style.width = `${(clock.dayNumber / 18) * 100}%`;
    if (journeyLabel) journeyLabel.textContent = "TODAY'S JOURNEY";
    const route = document.querySelector(`#${clock.day} .day-header .route`)?.textContent.trim() || `Day ${clock.dayNumber} itinerary`;
    if (journeyHeading) journeyHeading.textContent = route;
    if (locations[0]) locations[0].textContent = `Day ${String(clock.dayNumber).padStart(2, '0')}`;
    if (locations[1]) locations[1].textContent = 'Open today’s timeline';
    if (facts) facts.innerHTML = '<span>🗓 Confirmed itinerary</span><span>Details in Today’s Plan</span>';
    setCard(highlight, '⭐ DAY HIGHLIGHT', route, 'Open today’s timeline for confirmed times and bookings.');
    setCard(next, 'NEXT', 'Open today’s plan', 'Use the itinerary for the next confirmed event.');
    if (alertText) alertText.textContent = `Day ${clock.dayNumber} of 18 · check today’s timeline before leaving.`;
    setPlanDay(clock.day);
}

syncTripDashboard();

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
    document.body.classList.remove('app-hub-home', 'app-hub-itinerary', 'app-hub-map', 'app-hub-travel', 'app-hub-weather', 'app-hub-guide', 'app-hub-journal');
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
        map: 'journey-map-center',
        travel: 'travel-control-center',
        weather: 'weather-control-center',
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
    if (hub === 'map') window.setTimeout(() => window.JourneyMap?.refresh(), 60);
    if (hub === 'weather') window.setTimeout(() => window.TripWeather?.refresh(), 60);

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

function getTimelineCategory(title) {
    const text = title.toLowerCase();
    if (/雲西|arex|\btrain\b|火車|waverley|rail/.test(text)) return '🚆 Train';
    if (/取車|還車|driv|開車|rental|alamo|carbost|fort augustus/.test(text)) return '🚗 Driving';
    if (/lunch|dinner|breakfast|午餐|晚餐|早餐|tea rooms|afternoon tea|café|coffee/.test(text)) return '🍽 Food';
    if (/shop|shopping|採買|olive young|daiso/.test(text)) return '🛍 Shopping';
    if (/castle|museum|cathedral|palace|causeway|glencoe|skye|university|景點/.test(text)) return '🏰 Attraction';
    if (/forest|arsenal|football|match|球賽/.test(text)) return '⚽ Football';
    if (/photo|拍照|sunset|日落/.test(text)) return '📸 Photo';
    if (/tpe|icn|doh|bkk|qr\d|br\d|tg\d|ei\d|airport|機場|航班|登機|出境|lounge|抵達仁川|抵達 doha/.test(text)) return '✈️ Flight';
    return '💍 Honeymoon';
}

function timelineLocation(item) {
    const explicit = item.dataset.location || item.querySelector('[data-location]')?.dataset.location;
    if (explicit) return explicit;
    const title = item.querySelector('.event-title')?.textContent.trim() || '';
    if (/雲西站/.test(title)) return '雲西站';
    if (/仁川.*T1/.test(title)) return '仁川 T1';
    if (/Doha/.test(title)) return 'Doha';
    if (/TPE/.test(title)) return 'Taipei Taoyuan';
    if (/ICN/.test(title)) return 'Incheon';
    return '';
}

function enhanceTimelineItems(panel) {
    panel.querySelectorAll('.timeline-item').forEach(item => {
        if (item.dataset.timelineReady) return;
        item.dataset.timelineReady = 'true';
        const title = item.querySelector('.event-title');
        const detail = item.querySelector('.event-detail');
        if (!title) return;
        const category = getTimelineCategory(title.textContent);
        const location = timelineLocation(item);
        const meta = document.createElement('div');
        meta.className = 'timeline-meta';
        meta.innerHTML = `<span class="timeline-category">${category}</span>${location ? `<span class="timeline-location">📍 ${location}</span>` : ''}`;
        title.insertAdjacentElement('afterend', meta);
        if (detail && detail.textContent.trim()) {
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
    const sun = header.querySelector('.sun-times')?.textContent.trim() || 'Weather: check before departure';
    const summaryTitle = panel.id === '1009' ? 'Flight Day' : presentation.highlight;
    const summary = document.createElement('section');
    summary.className = 'daily-summary';
    summary.innerHTML = `
        <div class="daily-summary-heading"><div><span>DAY BRIEF</span><h3>${summaryTitle}</h3></div><span class="daily-summary-badge">${getTimelineCategory(title)}</span></div>
        <div class="daily-summary-grid">
            <div><small>NEXT</small><b>${time}<br>${title}</b></div>
            <div><small>GETTING AROUND</small><b>${presentation.driving}</b></div>
            <div><small>TONIGHT</small><b>🏨 ${presentation.stay}</b></div>
        </div>
        <div class="daily-summary-weather">🌦 ${sun}</div>
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
        const entry = presentation[panel.id] || { highlight: header?.querySelector('h2')?.textContent.trim() || 'Today’s plan', stay: 'See full itinerary', driving: 'See route in timeline' };
        if (panel.id === '1009') {
            const title = header?.querySelector('h2');
            const route = header?.querySelector('.route');
            if (title) title.textContent = '✈️ Flight Day';
            if (route) route.textContent = 'TPE · ICN · DOH';
        }
        addDailySummary(panel, entry);
        const summary = panel.querySelector('.daily-summary');
        const timelineCards = Array.from(panel.children).filter(child => child.classList?.contains('card') && child.querySelector('.timeline'));
        let timelineAnchor = summary;
        timelineCards.forEach(card => {
            timelineAnchor.insertAdjacentElement('afterend', card);
            timelineAnchor = card;
        });
        enhanceTimelineItems(panel);
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
