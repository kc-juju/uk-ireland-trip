/* Weather decision layer. Forecast data is live; itinerary facts remain local and unchanged. */
(function initializeTripWeather() {
    const root = document.getElementById('weather-control-center');
    if (!root || !window.TripData) return;

    const locations = {
        '1009': { name:'Taipei', lat:25.0330, lon:121.5654 },
        '1010': { name:'Manchester', lat:53.4808, lon:-2.2426 },
        '1011': { name:'Manchester', lat:53.4808, lon:-2.2426 },
        '1012': { name:'Edinburgh', lat:55.9533, lon:-3.1883 },
        '1013': { name:'Edinburgh', lat:55.9533, lon:-3.1883 },
        '1014': { name:'Fort William', lat:56.8198, lon:-5.1052, route:[{name:'Edinburgh',lat:55.9533,lon:-3.1883},{name:'Glencoe',lat:56.6822,lon:-4.9648},{name:'Fort William',lat:56.8198,lon:-5.1052}] },
        '1015': { name:'Isle of Skye', lat:57.2940, lon:-6.3420 },
        '1016': { name:'Isle of Skye', lat:57.2940, lon:-6.3420 },
        '1017': { name:'Fort Augustus', lat:57.1440, lon:-4.6807, route:[{name:'Isle of Skye',lat:57.2940,lon:-6.3420},{name:'Fort Augustus',lat:57.1440,lon:-4.6807},{name:'Glasgow',lat:55.8642,lon:-4.2518}] },
        '1018': { name:'Nottingham', lat:52.9548, lon:-1.1581 },
        '1019': { name:'Belfast', lat:54.5973, lon:-5.9301 },
        '1020': { name:'Giant’s Causeway', lat:55.2408, lon:-6.5116, route:[{name:'Belfast',lat:54.5973,lon:-5.9301},{name:'Giant’s Causeway',lat:55.2408,lon:-6.5116},{name:'Dublin',lat:53.3498,lon:-6.2603}] },
        '1021': { name:'Dublin', lat:53.3498, lon:-6.2603 },
        '1022': { name:'Dublin', lat:53.3498, lon:-6.2603 },
        '1023': { name:'Dublin', lat:53.3498, lon:-6.2603 },
        '1024': { name:'Bangkok', lat:13.7236, lon:100.5292 },
        '1025': { name:'Bangkok', lat:13.7236, lon:100.5292 },
        '1026': { name:'Bangkok', lat:13.7236, lon:100.5292 }
    };
    const presentation = window.TripData.meta.dailyPresentation || {};
    const clock = typeof getTripClock === 'function' ? getTripClock() : { phase:'before', day:'1009', daysToGo:0 };
    let selectedDay = clock.day;
    let selectedForecast = null;
    let refreshTimer = null;
    const cache = new Map();
    const weatherStates = new Map();
    const storagePrefix = 'honeymoon-weather-v2:';

    const weatherCodes = {
        0:['☀️','Clear sky'], 1:['🌤','Mostly clear'], 2:['🌥','Partly cloudy'], 3:['☁️','Overcast'],
        45:['🌫','Fog'], 48:['🌫','Rime fog'], 51:['🌦','Light drizzle'], 53:['🌦','Drizzle'], 55:['🌧','Heavy drizzle'],
        61:['🌧','Light rain'], 63:['🌧','Rain'], 65:['🌧','Heavy rain'], 71:['🌨','Light snow'], 73:['🌨','Snow'], 75:['🌨','Heavy snow'],
        80:['🌦','Showers'], 81:['🌧','Showers'], 82:['🌧','Heavy showers'], 95:['⛈','Thunderstorm']
    };
    const cityDay = id => `2026-10-${id.slice(2)}`;
    const code = value => weatherCodes[value] || ['🌦','Changeable'];
    const weatherDate = value => new Intl.DateTimeFormat('en-GB', { weekday:'long', day:'numeric', month:'long' }).format(new Date(`${value}T12:00:00`));
    const c = value => value == null ? '—' : `${Math.round(value)}°`;
    const kmh = value => value == null ? '—' : `${Math.round(value)} km/h`;
    const escape = text => String(text || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const isLiveDate = date => date === localDate(new Date());
    const formatUpdated = timestamp => timestamp ? new Intl.DateTimeFormat('en-GB', { hour:'2-digit', minute:'2-digit' }).format(new Date(timestamp)) : '—';
    const maxHourly = (forecast, date, field) => Math.max(...forecast.hourly.time.map((time, index) => time.startsWith(date) ? Number(forecast.hourly[field]?.[index] ?? 0) : 0));
    const visibility = value => value == null ? '—' : `${Math.round(value / 1000)} km`;
    const photoWindow = sunset => {
        if (!/^\d{2}:\d{2}$/.test(sunset)) return '—';
        const [hours, minutes] = sunset.split(':').map(Number);
        const start = (hours * 60 + minutes - 90 + 1440) % 1440;
        return `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')} – ${sunset}`;
    };

    function forecastRangeAllowed(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(`${date}T00:00:00`);
        const delta = Math.round((target - today) / 86400000);
        return delta >= -1 && delta <= 16;
    }

    function readStored(key) {
        try { return JSON.parse(localStorage.getItem(`${storagePrefix}${key}`) || 'null'); } catch { return null; }
    }

    function withMeta(data, meta) {
        if (!data) return data;
        data.__weatherMeta = meta;
        return data;
    }

    async function forecastFor(location, start, end = start, force = false) {
        const key = `${location.lat},${location.lon},${start},${end}`;
        const live = isLiveDate(start);
        const ttl = live ? 45 * 60 * 1000 : 4 * 60 * 60 * 1000;
        const cached = cache.get(key);
        if (!force && cached && Date.now() - cached.updatedAt < ttl) return cached.data;
        const stored = readStored(key);
        if (!forecastRangeAllowed(start)) {
            weatherStates.set(key, 'range');
            return stored?.data ? withMeta(stored.data, { updatedAt:stored.updatedAt, cached:true, live, status:'range' }) : null;
        }
        const params = new URLSearchParams({
            latitude: location.lat, longitude: location.lon,
            current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,visibility',
            hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,visibility,weather_code',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
            timezone: 'auto', start_date: start, end_date: end
        });
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
            if (!response.ok) throw new Error('Forecast unavailable');
            const data = await response.json();
            const updatedAt = Date.now();
            const prepared = withMeta(data, { updatedAt, cached:false, live, status:'ok' });
            cache.set(key, { data:prepared, updatedAt });
            try { localStorage.setItem(`${storagePrefix}${key}`, JSON.stringify({ data, updatedAt })); } catch { /* storage is optional */ }
            weatherStates.set(key, 'ok');
            return prepared;
        } catch (error) {
            weatherStates.set(key, 'error');
            const fallback = cached?.data || stored?.data;
            return fallback ? withMeta(fallback, { updatedAt:cached?.updatedAt || stored.updatedAt, cached:true, live, status:'error' }) : null;
        }
    }

    function dayEvents(day) {
        const panel = document.getElementById(day);
        const events = [...(panel?.querySelectorAll('.timeline-item .event-title') || [])].map(item => item.textContent.trim()).filter(Boolean);
        return events.length ? events.slice(0, 5) : [presentation[day]?.highlight || 'Today’s itinerary'];
    }

    function classifyEvent(event, forecast) {
        const indoor = /museum|tea rooms|afternoon tea|hotel|airbnb|restaurant|lunch|dinner|shopping|whisky experience/i.test(event);
        if (indoor) return { status:'✓ Low weather impact', note:'Indoor or flexible stop in the existing itinerary.' };
        if (!forecast) return { status:'• Check nearer travel date', note:'A live forecast is not available yet.' };
        const daily = forecast.daily;
        const rain = daily?.precipitation_probability_max?.[0] || 0;
        const gust = maxHourly(forecast, cityDay(selectedDay), 'wind_gusts_10m');
        if (rain >= 70 || gust >= 50) return { status:'⚠ High weather impact', note:`${rain}% rain chance · gusts ${kmh(gust)}.` };
        if (rain >= 40 || gust >= 35) return { status:'🌦 Moderate weather impact', note:`${rain}% rain chance · gusts ${kmh(gust)}.` };
        return { status:'✓ Low weather impact', note:'Current forecast shows manageable outdoor conditions.' };
    }

    function travelAdvice(forecast, location) {
        if (!forecast) return '預報資料通常在出發日前約 16 天內可用。行程維持原定安排，接近日期時再依雨勢與風速決定戶外停留時間。';
        const daily = forecast.daily;
        const rain = daily.precipitation_probability_max?.[0] || 0;
        const gust = maxHourly(forecast, cityDay(selectedDay), 'wind_gusts_10m');
        const highlands = /Skye|Fort William|Fort Augustus|Giant/i.test(location.name);
        if (gust >= 50 && highlands) return '今日陣風偏強，暴露型觀景點與高地步道請注意安全。以現場狀況為準，遇強風時優先縮短停留而不是趕行程。';
        if (rain >= 65) return '降雨機率偏高。優先完成已預約或時間固定的安排；其餘步行與戶外停留請保留雨備與彈性。';
        if (rain >= 35 || gust >= 35) return '天氣變化可能影響戶外步行。上午若較穩定，優先處理戶外段落；室內或用餐安排可作為緩衝。';
        return '目前預報對既有安排影響有限。仍建議保留外套與防水層，英國與愛爾蘭天氣可能快速變化。';
    }

    function outfit(forecast, location) {
        if (!forecast) return ['🧥 Waterproof outer layer', '👖 Long pants', '🥾 Water-resistant shoes', '☂️ Check forecast closer to departure'];
        const daily = forecast.daily;
        const low = daily.temperature_2m_min?.[0] ?? 10;
        const rain = daily.precipitation_probability_max?.[0] || 0;
        const gust = maxHourly(forecast, cityDay(selectedDay), 'wind_gusts_10m');
        const highlands = /Skye|Fort William|Fort Augustus|Giant/i.test(location.name);
        const items = [low <= 10 ? '🧶 Sweater / mid layer' : '👕 Light layer', '👖 Long pants', '🥾 Water-resistant shoes'];
        if (rain >= 30 || gust >= 35) items.unshift('🧥 Waterproof jacket');
        if (highlands && gust >= 35) items.push('💨 Windproof outer layer — prefer this over an umbrella');
        else if (rain >= 45) items.push('☂️ Compact umbrella');
        return items;
    }

    function routeWeather(forecast, location) {
        if (!location.route) return '';
        const cards = location.route.map(stop => `<article><b>${escape(stop.name)}</b><span class="route-weather-value" data-route-weather="${stop.name}">Loading…</span></article>`).join('<i>↓</i>');
        setTimeout(async () => {
            await Promise.all(location.route.map(async stop => {
                const item = root.querySelector(`[data-route-weather="${CSS.escape(stop.name)}"]`);
                const data = await forecastFor(stop, cityDay(selectedDay));
                if (!item) return;
                if (!data) { item.textContent = 'Forecast unavailable'; return; }
                const daily = data.daily;
                item.innerHTML = `${code(daily.weather_code?.[0])[0]} ${c(daily.temperature_2m_max?.[0])}`;
            }));
        }, 0);
        return `<section class="weather-section route-weather"><div class="weather-section-title"><div><span>ROUTE WEATHER</span><h3>${escape(location.name)} route</h3></div></div><div class="route-weather-flow">${cards}</div></section>`;
    }

    function renderForecast(forecast, day, location) {
        const date = cityDay(day);
        const hero = root.querySelector('.weather-data');
        if (!hero) return;
        const forecastKey = `${location.lat},${location.lon},${date},${date}`;
        if (!forecast) {
            const failed = weatherStates.get(forecastKey) === 'error';
            const message = failed ? 'Weather temporarily unavailable. Your itinerary is still available below; retrying when the page is refreshed.' : '這一天尚未進入即時預報範圍，因此不會顯示猜測的天氣數字。接近出發日後，這裡會自動載入預報與行程建議。';
            hero.innerHTML = `<section class="weather-unavailable"><span>☼</span><div><div class="eyebrow">FORECAST STATUS</div><h2>${escape(location.name)} · ${weatherDate(date)}</h2><p>${message}</p></div></section>${renderItineraryOnly(day, location)}`;
            return;
        }
        const daily = forecast.daily;
        const hourly = forecast.hourly;
        const meta = forecast.__weatherMeta || {};
        const hourlyIndices = hourly.time.map((time, index) => ({time,index})).filter(item => item.time.startsWith(date) && /T(08|10|12|14|16|18):/.test(item.time)).slice(0, 6);
        const referenceIndex = hourly.time.findIndex(time => time.startsWith(date + 'T12')) >= 0 ? hourly.time.findIndex(time => time.startsWith(date + 'T12')) : hourlyIndices[0]?.index || 0;
        const live = meta.live && isLiveDate(date) && forecast.current;
        const reading = live ? forecast.current : {
            temperature_2m: hourly.temperature_2m?.[referenceIndex], apparent_temperature: hourly.apparent_temperature?.[referenceIndex],
            relative_humidity_2m: hourly.relative_humidity_2m?.[referenceIndex], precipitation: hourly.precipitation?.[referenceIndex],
            weather_code: hourly.weather_code?.[referenceIndex], wind_speed_10m: hourly.wind_speed_10m?.[referenceIndex],
            wind_gusts_10m: hourly.wind_gusts_10m?.[referenceIndex], visibility: hourly.visibility?.[referenceIndex]
        };
        const condition = code(reading.weather_code ?? daily.weather_code?.[0]);
        const hourlyCards = hourlyIndices.map(({time,index}) => `<article><b>${time.slice(11,16)}</b><span>${code(hourly.weather_code[index])[0]}</span><strong>${c(hourly.temperature_2m[index])}</strong><small>🌧 ${hourly.precipitation_probability[index] ?? '—'}%</small><small>💨 ${kmh(hourly.wind_speed_10m[index])}</small></article>`).join('') || '<p>Hourly forecast is not available for this date.</p>';
        const sun = { rise: daily.sunrise?.[0]?.slice(11,16) || '—', set: daily.sunset?.[0]?.slice(11,16) || '—' };
        const events = dayEvents(day);
        const impacts = events.map(event => { const impact = classifyEvent(event, forecast); return `<article class="impact-item"><div><b>${escape(event)}</b><span>${impact.status}</span></div><p>${impact.note}</p></article>`; }).join('');
        const indoor = events.filter(event => /museum|tea rooms|afternoon tea|hotel|airbnb|restaurant|lunch|dinner|shopping/i.test(event));
        const rain = daily.precipitation_probability_max?.[0] || 0;
        const gust = live ? reading.wind_gusts_10m : maxHourly(forecast, date, 'wind_gusts_10m');
        const precipitation = live ? reading.precipitation : daily.precipitation_sum?.[0];
        const driving = presentation[day]?.driving || '';
        const drivingSection = !/no driving|walk|train|airport transfer/i.test(driving) ? `<section class="weather-section driving-weather"><div class="weather-section-title"><div><span>DRIVING CONDITIONS</span><h3>${escape(document.querySelector(`#${day} .day-header .route`)?.textContent.trim() || location.name)}</h3></div><b>${escape(driving)}</b></div><div class="condition-grid"><span>🌧 Rain <b>${rain}%</b></span><span>💨 Gusts <b>${kmh(gust)}</b></span><span>🌫 Visibility <b>${visibility(reading.visibility)}</b></span><span>🌅 Daylight <b>until ${sun.set}</b></span></div><p>${/Skye|Fort William|Fort Augustus/i.test(location.name) ? 'Highlands weather can change quickly. Keep extra time for slower roads, rain and reduced visibility.' : 'Allow a buffer for changing conditions and follow local road guidance.'}</p></section>` : '';
        hero.innerHTML = `
            <section class="weather-hero-data"><div><span class="eyebrow">${live ? 'LIVE WEATHER' : 'FORECAST / SELECTED DAY'}</span><h2>${escape(location.name)}</h2><p>${weatherDate(date)} · Last updated ${formatUpdated(meta.updatedAt)}</p></div><div class="weather-temperature"><span>${condition[0]}</span><strong>${c(reading.temperature_2m)}</strong><small>Feels like ${c(reading.apparent_temperature)}</small><b>${condition[1]}</b></div></section>
            ${meta.status === 'error' ? '<p class="weather-source-note">Weather temporarily unavailable — showing the last successful update.</p>' : `<p class="weather-source-note">${live ? 'Live data' : 'Forecast data'}: Open-Meteo · refreshed automatically</p>`}
            <section class="weather-facts"><span>🌧 Rain <b>${rain}%</b></span><span>💧 Precipitation <b>${precipitation == null ? '—' : `${Number(precipitation).toFixed(1)} mm`}</b></span><span>💨 Wind <b>${kmh(reading.wind_speed_10m)}</b></span><span>💨 Gusts <b>${kmh(gust)}</b></span><span>💧 Humidity <b>${reading.relative_humidity_2m ?? '—'}%</b></span><span>🌫 Visibility <b>${visibility(reading.visibility)}</b></span><span>🌅 Sunrise <b>${sun.rise}</b></span><span>🌇 Sunset <b>${sun.set}</b></span></section>
            <section class="weather-advice"><div><span>TRAVEL CONDITIONS</span><h3>今天行程要不要改？</h3></div><p>${travelAdvice(forecast, location)}</p></section>
            <section class="weather-section"><div class="weather-section-title"><div><span>HOURLY FORECAST</span><h3>Rain and wind first</h3></div></div><div class="hourly-strip">${hourlyCards}</div></section>
            <section class="weather-section"><div class="weather-section-title"><div><span>TODAY'S ITINERARY IMPACT</span><h3>依現有行程判讀</h3></div><button type="button" data-weather-open-day="${day}">View Day</button></div><div class="impact-list">${impacts}</div></section>
            <section class="weather-section outfit-section"><div class="weather-section-title"><div><span>WHAT TO WEAR</span><h3>Practical packing list</h3></div></div><ul>${outfit(forecast, location).map(item => `<li>${item}</li>`).join('')}</ul></section>
            ${rain >= 55 ? `<section class="weather-section rain-plan"><div class="weather-section-title"><div><span>RAIN PLAN</span><h3>Keep the itinerary flexible</h3></div></div><div><b>Original Plan</b><p>${events.map(escape).join(' → ')}</p></div><div><b>Weather Alternative</b><p>${indoor.length ? `${indoor.map(escape).join(' → ')} · keep outdoor stops flexible` : 'Prioritise booked or time-fixed items, then use the booked stay or existing meal stops as a rest option.'}</p></div><small>This is weather advice only; it does not change the itinerary.</small></section>` : ''}
            ${drivingSection}
            ${routeWeather(forecast, location)}
            <section class="weather-section best-moment"><div><span>BEST PHOTO WINDOW</span><h3>${photoWindow(sun.set)}</h3><p>Based on today’s ${sun.set} sunset; use the hourly strip to choose the lowest-rain window.</p></div><span>📸</span></section>
            <section class="weather-section"><div class="weather-section-title"><div><span>UPCOMING WEATHER</span><h3>Next 7 travel days</h3></div></div><div class="weather-upcoming" data-weather-upcoming>Loading forecast availability…</div></section>`;
        renderUpcoming(day);
    }

    function renderItineraryOnly(day, location) {
        const events = dayEvents(day);
        return `<section class="weather-section"><div class="weather-section-title"><div><span>TODAY'S ITINERARY</span><h3>${escape(location.name)}</h3></div><button type="button" data-weather-open-day="${day}">View Day</button></div><div class="impact-list">${events.map(event => `<article class="impact-item"><div><b>${escape(event)}</b><span>• Forecast pending</span></div><p>Weather impact will appear once a live forecast is available.</p></article>`).join('')}</div></section><section class="weather-section outfit-section"><div class="weather-section-title"><div><span>WHAT TO WEAR</span><h3>Plan ahead</h3></div></div><ul>${outfit(null, location).map(item => `<li>${item}</li>`).join('')}</ul></section>`;
    }

    async function renderUpcoming(day) {
        const container = root.querySelector('[data-weather-upcoming]');
        if (!container) return;
        const first = Number(day.slice(2));
        const days = Array.from({length:7}, (_, index) => `10${String(first + index).padStart(2,'0')}`).filter(id => locations[id]);
        const cards = await Promise.all(days.map(async id => {
            const location = locations[id];
            const forecast = await forecastFor(location, cityDay(id));
            if (!forecast) return `<button type="button" data-weather-day="${id}"><small>${id.slice(2)}</small><b>${escape(location.name)}</b><span>—</span><em>Forecast later</em></button>`;
            const daily = forecast.daily;
            const rain = daily.precipitation_probability_max?.[0] || 0;
            const status = rain >= 65 ? '⚠ Weather risk' : rain >= 35 ? '🌦 Mixed' : '✓ Good';
            return `<button type="button" data-weather-day="${id}"><small>${id.slice(2)}</small><b>${escape(location.name)}</b><span>${code(daily.weather_code?.[0])[0]} ${c(daily.temperature_2m_max?.[0])} / ${c(daily.temperature_2m_min?.[0])}</span><em>🌧 ${rain}% · ${status}</em></button>`;
        }));
        container.innerHTML = cards.join('');
        container.querySelectorAll('[data-weather-day]').forEach(button => button.addEventListener('click', () => selectDay(button.dataset.weatherDay)));
    }

    function scheduleRefresh() {
        window.clearTimeout(refreshTimer);
        const interval = isLiveDate(cityDay(selectedDay)) ? 45 * 60 * 1000 : 4 * 60 * 60 * 1000;
        refreshTimer = window.setTimeout(() => {
            if (!document.hidden) selectDay(selectedDay, true);
            else scheduleRefresh();
        }, interval);
    }

    async function selectDay(day, force = false) {
        selectedDay = day;
        const location = locations[day] || locations['1009'];
        root.querySelector(':scope > .weather-loading-card')?.remove();
        root.querySelector('.weather-data').innerHTML = '<section class="weather-loading-card"><span>☼</span><div><b>Updating travel weather…</b><p>Matching the forecast to this itinerary day.</p></div></section>';
        root.querySelectorAll('[data-weather-day]').forEach(button => button.classList.toggle('active', button.dataset.weatherDay === day));
        selectedForecast = await forecastFor(location, cityDay(day), cityDay(day), force);
        renderForecast(selectedForecast, day, location);
        scheduleRefresh();
    }

    root.innerHTML += `<div class="weather-data"></div>`;
    root.addEventListener('click', event => {
        const trigger = event.target.closest('[data-weather-open-day]');
        if (!trigger) return;
        const id = trigger.dataset.weatherOpenDay;
        const tab = document.querySelector(`.tab[onclick*="${id}"]`);
        if (tab) showTab(id, tab);
    });
    selectDay(selectedDay);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) selectDay(selectedDay, false);
    });
    window.TripWeather = { refresh() { selectDay(selectedDay, false); }, focusDay: selectDay };
}());
