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
    const cache = new Map();

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

    function forecastRangeAllowed(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(`${date}T00:00:00`);
        const delta = Math.round((target - today) / 86400000);
        return delta >= -1 && delta <= 16;
    }

    async function forecastFor(location, start, end = start) {
        const key = `${location.lat},${location.lon},${start},${end}`;
        if (cache.has(key)) return cache.get(key);
        if (!forecastRangeAllowed(start)) return null;
        const params = new URLSearchParams({
            latitude: location.lat, longitude: location.lon,
            hourly: 'temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,relative_humidity_2m,weather_code',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset',
            timezone: 'auto', start_date: start, end_date: end
        });
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
            if (!response.ok) throw new Error('Forecast unavailable');
            const data = await response.json();
            cache.set(key, data);
            return data;
        } catch (error) {
            return null;
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
        const wind = daily?.wind_speed_10m_max?.[0] || 0;
        if (rain >= 70 || wind >= 40) return { status:'⚠ High weather impact', note:`${rain}% rain chance · ${kmh(wind)} wind.` };
        if (rain >= 40 || wind >= 25) return { status:'🌦 Moderate weather impact', note:`${rain}% rain chance · ${kmh(wind)} wind.` };
        return { status:'✓ Low weather impact', note:'Current forecast shows manageable outdoor conditions.' };
    }

    function travelAdvice(forecast, location) {
        if (!forecast) return '預報資料通常在出發日前約 16 天內可用。行程維持原定安排，接近日期時再依雨勢與風速決定戶外停留時間。';
        const daily = forecast.daily;
        const rain = daily.precipitation_probability_max?.[0] || 0;
        const wind = daily.wind_speed_10m_max?.[0] || 0;
        const highlands = /Skye|Fort William|Fort Augustus|Giant/i.test(location.name);
        if (wind >= 40 && highlands) return '風勢偏強；海岸、懸崖與高地步道以現場狀況為準。將戶外景點保留彈性，遇強風時優先縮短停留而不是趕行程。';
        if (rain >= 65) return '降雨機率偏高。優先完成已預約或時間固定的安排；其餘步行與戶外停留請保留雨備與彈性。';
        if (rain >= 35 || wind >= 25) return '天氣變化可能影響戶外步行。上午若較穩定，優先處理戶外段落；室內或用餐安排可作為緩衝。';
        return '目前預報對既有安排影響有限。仍建議保留外套與防水層，英國與愛爾蘭天氣可能快速變化。';
    }

    function outfit(forecast, location) {
        if (!forecast) return ['🧥 Waterproof outer layer', '👖 Long pants', '🥾 Water-resistant shoes', '☂️ Check forecast closer to departure'];
        const daily = forecast.daily;
        const low = daily.temperature_2m_min?.[0] ?? 10;
        const rain = daily.precipitation_probability_max?.[0] || 0;
        const wind = daily.wind_speed_10m_max?.[0] || 0;
        const highlands = /Skye|Fort William|Fort Augustus|Giant/i.test(location.name);
        const items = [low <= 10 ? '🧶 Sweater / mid layer' : '👕 Light layer', '👖 Long pants', '🥾 Water-resistant shoes'];
        if (rain >= 30 || wind >= 25) items.unshift('🧥 Waterproof jacket');
        if (highlands && wind >= 25) items.push('💨 Windproof outer layer — prefer this over an umbrella');
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
        if (!forecast) {
            hero.innerHTML = `<section class="weather-unavailable"><span>☼</span><div><div class="eyebrow">FORECAST STATUS</div><h2>${escape(location.name)} · ${weatherDate(date)}</h2><p>這一天尚未進入即時預報範圍，因此不會顯示猜測的天氣數字。接近出發日後，這裡會自動載入預報與行程建議。</p></div></section>${renderItineraryOnly(day, location)}`;
            return;
        }
        const daily = forecast.daily;
        const hourly = forecast.hourly;
        const condition = code(daily.weather_code?.[0]);
        const hourlyIndices = hourly.time.map((time, index) => ({time,index})).filter(item => item.time.startsWith(date) && /T(08|10|12|14|16|18):/.test(item.time)).slice(0, 6);
        const hourlyCards = hourlyIndices.map(({time,index}) => `<article><b>${time.slice(11,16)}</b><span>${code(hourly.weather_code[index])[0]}</span><strong>${c(hourly.temperature_2m[index])}</strong><small>🌧 ${hourly.precipitation_probability[index] ?? '—'}%</small><small>💨 ${kmh(hourly.wind_speed_10m[index])}</small></article>`).join('') || '<p>Hourly forecast is not available for this date.</p>';
        const sun = { rise: daily.sunrise?.[0]?.slice(11,16) || '—', set: daily.sunset?.[0]?.slice(11,16) || '—' };
        const events = dayEvents(day);
        const impacts = events.map(event => { const impact = classifyEvent(event, forecast); return `<article class="impact-item"><div><b>${escape(event)}</b><span>${impact.status}</span></div><p>${impact.note}</p></article>`; }).join('');
        const indoor = events.filter(event => /museum|tea rooms|afternoon tea|hotel|airbnb|restaurant|lunch|dinner|shopping/i.test(event));
        const rain = daily.precipitation_probability_max?.[0] || 0;
        const driving = presentation[day]?.driving || '';
        const drivingSection = !/no driving|walk|train|airport transfer/i.test(driving) ? `<section class="weather-section driving-weather"><div class="weather-section-title"><div><span>DRIVING CONDITIONS</span><h3>${escape(document.querySelector(`#${day} .day-header .route`)?.textContent.trim() || location.name)}</h3></div><b>${escape(driving)}</b></div><div class="condition-grid"><span>🌧 Rain <b>${rain}%</b></span><span>💨 Wind <b>${kmh(daily.wind_speed_10m_max?.[0])}</b></span><span>🌅 Daylight <b>until ${sun.set}</b></span></div><p>${/Skye|Fort William|Fort Augustus/i.test(location.name) ? 'Highlands weather can change quickly. Keep extra time for slower roads, rain and reduced visibility.' : 'Allow a buffer for changing conditions and follow local road guidance.'}</p></section>` : '';
        hero.innerHTML = `
            <section class="weather-hero-data"><div><span class="eyebrow">TODAY / SELECTED DAY</span><h2>${escape(location.name)}</h2><p>${weatherDate(date)}</p></div><div class="weather-temperature"><span>${condition[0]}</span><strong>${c(daily.temperature_2m_max?.[0])}</strong><small>Feels like ${c(hourly.apparent_temperature?.[hourlyIndices[2]?.index ?? 0])}</small><b>${condition[1]}</b></div></section>
            <section class="weather-facts"><span>🌧 Rain <b>${rain}%</b></span><span>💨 Wind <b>${kmh(daily.wind_speed_10m_max?.[0])}</b></span><span>🌅 Sunrise <b>${sun.rise}</b></span><span>🌇 Sunset <b>${sun.set}</b></span></section>
            <section class="weather-advice"><div><span>TRAVEL CONDITIONS</span><h3>今天行程要不要改？</h3></div><p>${travelAdvice(forecast, location)}</p></section>
            <section class="weather-section"><div class="weather-section-title"><div><span>HOURLY FORECAST</span><h3>Rain and wind first</h3></div></div><div class="hourly-strip">${hourlyCards}</div></section>
            <section class="weather-section"><div class="weather-section-title"><div><span>TODAY'S ITINERARY IMPACT</span><h3>依現有行程判讀</h3></div><button type="button" data-weather-open-day="${day}">View Day</button></div><div class="impact-list">${impacts}</div></section>
            <section class="weather-section outfit-section"><div class="weather-section-title"><div><span>WHAT TO WEAR</span><h3>Practical packing list</h3></div></div><ul>${outfit(forecast, location).map(item => `<li>${item}</li>`).join('')}</ul></section>
            ${rain >= 55 ? `<section class="weather-section rain-plan"><div class="weather-section-title"><div><span>RAIN PLAN</span><h3>Keep the itinerary flexible</h3></div></div><div><b>Original Plan</b><p>${events.map(escape).join(' → ')}</p></div><div><b>Weather Alternative</b><p>${indoor.length ? `${indoor.map(escape).join(' → ')} · keep outdoor stops flexible` : 'Prioritise booked or time-fixed items, then use the booked stay or existing meal stops as a rest option.'}</p></div><small>This is weather advice only; it does not change the itinerary.</small></section>` : ''}
            ${drivingSection}
            ${routeWeather(forecast, location)}
            <section class="weather-section best-moment"><div><span>BEST PHOTO WINDOW</span><h3>${sun.rise} – ${sun.set}</h3><p>Check the hourly strip for the lowest rain probability before heading to an outdoor stop.</p></div><span>📸</span></section>
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

    async function selectDay(day) {
        selectedDay = day;
        const location = locations[day] || locations['1009'];
        root.querySelector(':scope > .weather-loading-card')?.remove();
        root.querySelector('.weather-data').innerHTML = '<section class="weather-loading-card"><span>☼</span><div><b>Updating travel weather…</b><p>Matching the forecast to this itinerary day.</p></div></section>';
        root.querySelectorAll('[data-weather-day]').forEach(button => button.classList.toggle('active', button.dataset.weatherDay === day));
        selectedForecast = await forecastFor(location, cityDay(day));
        renderForecast(selectedForecast, day, location);
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
    window.TripWeather = { refresh() { if (!selectedForecast) selectDay(selectedDay); }, focusDay: selectDay };
}());
