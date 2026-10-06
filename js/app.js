/* State and interaction layer. The itinerary data is rendered before bindings attach. */
(function bootstrapTripApp() {
    const mount = document.getElementById('app');
    if (!mount || !window.TripData || !window.TripComponents) {
        throw new Error('Trip data or UI components are unavailable.');
    }
    mount.innerHTML = window.TripComponents.renderApp(window.TripData);
}());



function showTab(id, button) {

    document.body.classList.toggle('app-itinerary', id !== 'overview');
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

function setActiveHub(hub) {
    appNavButtons.forEach(button => button.classList.toggle('active', button.dataset.hub === hub));
}

function showHub(hub) {
    const overviewButton = document.querySelector('.tab[onclick*="overview"]');
    const targetByHub = {
        home: 'home-hub',
        map: 'route-map',
        travel: 'flight-summary',
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
    setActiveHub(hub);

    const target = document.getElementById(targetByHub[hub] || 'home-hub');
    if (target) {
        window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
    }
}

appNavButtons.forEach(button => button.addEventListener('click', () => showHub(button.dataset.hub)));

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

function enhanceDailyPanels() {
    document.querySelectorAll('.tab-content:not(#overview)').forEach(panel => {
        const header = panel.querySelector('.day-header');
        const timelineTitle = panel.querySelector('.timeline .event-title');
        if (header && !panel.querySelector('.day-brief')) {
            const brief = document.createElement('aside');
            brief.className = 'day-brief';
            brief.innerHTML = `
                <div>
                    <div class="day-brief-label">TODAY AT A GLANCE</div>
                    <div class="day-brief-focus">${timelineTitle ? timelineTitle.textContent.trim() : '查看今日安排'}</div>
                    <div class="day-brief-route">${header.querySelector('.route') ? header.querySelector('.route').textContent.trim() : ''}</div>
                </div>
                <button type="button">完整安排</button>`;
            brief.querySelector('button').addEventListener('click', () => {
                const firstCard = panel.querySelector('.card');
                firstCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            header.insertAdjacentElement('afterend', brief);
        }

        const cards = Array.from(panel.children).filter(child => child.classList?.contains('card'));
        cards.forEach((card, index) => {
            if (index < 2 || card.dataset.progressiveReady) return;
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
setActiveHub('home');
