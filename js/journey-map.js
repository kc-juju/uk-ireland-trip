/* Map interaction layer. Leaflet draws geography; Google Maps opens actual navigation. */
(function initializeJourneyMap() {
    const data = window.TripData?.meta?.journeyMap;
    const canvas = document.getElementById('journey-leaflet-map');
    const center = document.getElementById('journey-map-center');
    if (!data || !canvas || !center) return;

    const sheet = center.querySelector('.location-sheet');
    const mapElement = canvas;
    const icons = { city:'🏙', attraction:'🏰', hotel:'🏨', food:'🍽', football:'⚽', scenic:'📸', airport:'✈', train:'🚆', driving:'🚗' };
    const clock = typeof getTripClock === 'function' ? getTripClock() : { phase:'during', day:data.todayDay };
    const todayDay = clock.day;
    const todayLabel = clock.phase === 'before' ? 'Next · Day 01' : clock.phase === 'after' ? 'Final day · Day 18' : `Today · Day ${String(clock.dayNumber).padStart(2, '0')}`;
    const locations = new Map(data.places.map(place => [place.id, place]));
    let activeDay = 'all';
    let activeFilter = 'all';
    let leafletMap;
    let markers = [];
    let routeLayers = [];

    function sheetFor(place) {
        if (!place) return;
        sheet.querySelector('.sheet-icon').textContent = icons[place.kind] || '⌖';
        sheet.querySelector('.sheet-type').textContent = `${place.kind.toUpperCase()} · DAY ${place.day.replace('10','')}`;
        sheet.querySelector('h3').textContent = place.name;
        sheet.querySelector('p').textContent = place.description;
        const view = sheet.querySelector('[data-map-view-day]');
        view.disabled = false;
        view.onclick = () => {
            const tab = document.querySelector(`.tab[onclick*="${place.day}"]`);
            if (tab) showTab(place.day, tab);
        };
        const maps = sheet.querySelector('[data-map-google]');
        maps.href = place.maps;
        maps.hidden = false;
        sheet.classList.add('is-open');
    }

    function visiblePlace(place) {
        if (activeDay === 'today' && place.day !== todayDay) return false;
        if (activeDay !== 'all' && activeDay !== 'today') {
            const day = data.highlandsDays.find(item => item.id === activeDay);
            if (day && !day.points.includes(place.id)) return false;
        }
        if (activeFilter === 'today') return place.day === todayDay;
        if (activeFilter === 'saved') return place.saved;
        return activeFilter === 'all' || place.kind === activeFilter;
    }

    function styleFor(mode) {
        return {
            flight: { color:'#24384a', dashArray:'7 8', weight:2.4 },
            train: { color:'#b89857', dashArray:'2 6', weight:3 },
            driving: { color:'#173f35', weight:4 },
            coach: { color:'#7b6a98', dashArray:'10 6', weight:3 }
        }[mode];
    }

    function refreshLayers(fit = false) {
        if (!leafletMap) return;
        markers.forEach(item => leafletMap.removeLayer(item.layer));
        markers = [];
        data.places.filter(visiblePlace).forEach(place => {
            const marker = L.marker(place.coords, { icon:L.divIcon({ className:`journey-marker marker-${place.kind}`, html:`<span>${icons[place.kind] || '⌖'}</span>`, iconSize:[34,34], iconAnchor:[17,17] }) });
            marker.on('click', () => sheetFor(place));
            marker.addTo(leafletMap);
            markers.push({ place, layer:marker });
        });
        routeLayers.forEach(layer => leafletMap.removeLayer(layer));
        routeLayers = [];
        const routes = activeDay === 'all' || activeDay === 'today'
            ? data.routes
            : [{ mode:'driving', points:data.highlandsDays.find(day => day.id === activeDay)?.points || [] }];
        routes.forEach(route => {
            const points = route.points.map(id => locations.get(id)?.coords).filter(Boolean);
            if (points.length < 2) return;
            const layer = L.polyline(points, styleFor(route.mode));
            layer.addTo(leafletMap);
            routeLayers.push(layer);
        });
        if (fit) {
            const points = markers.map(item => item.place.coords);
            if (points.length > 1) leafletMap.fitBounds(points, { padding:[38,38], maxZoom:9 });
        }
    }

    function selectDay(day) {
        activeDay = day;
        activeFilter = day === 'today' ? 'today' : 'all';
        center.querySelectorAll('[data-map-day]').forEach(button => button.classList.toggle('active', button.dataset.mapDay === day));
        center.querySelectorAll('[data-map-filter]').forEach(button => button.classList.toggle('active', button.dataset.mapFilter === activeFilter));
        refreshLayers(true);
    }

    function initializeLeaflet() {
        if (!window.L) {
            canvas.innerHTML = '<div class="map-fallback">Map layer is unavailable. Use the journey list and Google Maps links for navigation.</div>';
            return;
        }
        leafletMap = L.map(mapElement, { zoomControl:false, attributionControl:true, scrollWheelZoom:false }).setView([54.5,-3.5], 5);
        L.control.zoom({ position:'bottomright' }).addTo(leafletMap);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap contributors' }).addTo(leafletMap);
        refreshLayers(true);
    }

    const todayDayButton = center.querySelector('[data-map-day="today"]');
    if (todayDayButton) todayDayButton.textContent = todayLabel;

    center.querySelectorAll('[data-map-filter]').forEach(button => button.addEventListener('click', () => {
        activeFilter = button.dataset.mapFilter;
        activeDay = activeFilter === 'today' ? 'today' : 'all';
        center.querySelectorAll('[data-map-filter]').forEach(chip => chip.classList.toggle('active', chip === button));
        center.querySelectorAll('[data-map-day]').forEach(day => day.classList.toggle('active', day.dataset.mapDay === activeDay));
        refreshLayers(true);
    }));
    center.querySelectorAll('[data-map-day]').forEach(button => button.addEventListener('click', () => selectDay(button.dataset.mapDay)));
    center.querySelector('.sheet-close').addEventListener('click', () => sheet.classList.remove('is-open'));
    center.querySelector('.map-summary-toggle').addEventListener('click', event => {
        const summary = center.querySelector('.map-journey-summary');
        const expanded = !summary.hidden;
        summary.hidden = expanded;
        event.currentTarget.setAttribute('aria-expanded', String(!expanded));
        event.currentTarget.textContent = expanded ? 'Show Journey Summary' : 'Journey Summary';
    });

    window.JourneyMap = {
        refresh() { if (leafletMap) { leafletMap.invalidateSize(); window.setTimeout(() => refreshLayers(true), 0); } },
        focusDay: selectDay
    };
    initializeLeaflet();
}());
