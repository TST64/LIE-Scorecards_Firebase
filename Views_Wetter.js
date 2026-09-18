// =========================================================================
// BMAssistent / LIE Scorecard - Wetter-Modul & Platzprognose
// Views_Wetter.js
// BSD (Allman) Style
// =========================================================================

app.views = app.views || {};

app.views.wetter = function()
{
    // Rendere das initiale Skelett und starte das Laden der Wetterdaten
    setTimeout(
        function()
        {
            app.logic.loadWetterData();
        },
        50
    );

    return `
        <div class="space-y-5 max-w-4xl mx-auto pb-12 animate-fade-in">
            <!-- Header -->
            <div class="border-b border-zinc-200 pb-3 flex justify-between items-center">
                <div class="flex items-center space-x-2">
                    <button onclick="app.router.navigate('dashboard')" class="text-zinc-500 touch-target">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h2 class="text-lg font-black text-zinc-900 tracking-tight">Platzwetter & Wind</h2>
                        <p class="text-xs text-zinc-400 font-medium -mt-0.5">Live-Daten & Vorhersage für die Golfrunde</p>
                    </div>
                </div>
                <button onclick="app.logic.loadWetterData(true)" id="wetter-refresh-btn" class="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 touch-target">
                    <i id="wetter-refresh-icon" class="fas fa-location-crosshairs text-emerald-600"></i>
                    <span>Ortung</span>
                </button>
            </div>

            <!-- Dynamischer Container für Wetterinhalt -->
            <div id="wetter-content-container">
                <div class="bg-white border border-zinc-200 rounded-3xl p-8 text-center space-y-3 shadow-xs">
                    <i class="fas fa-spinner fa-spin text-emerald-600 text-3xl"></i>
                    <p class="text-zinc-600 font-bold text-xs">Ermittle GPS-Standort & Wetterdaten...</p>
                </div>
            </div>
        </div>
    `;
};

// ==========================================
// WETTER LOGIK & OPEN-METEO API
// ==========================================

app.logic.loadWetterData = function(forceRefresh = false)
{
    const container = document.getElementById('wetter-content-container');
    const refreshIcon = document.getElementById('wetter-refresh-icon');

    if (refreshIcon) 
    {
        refreshIcon.classList.add('fa-spin');
    }

    // Nutzen von Cache, falls vorhanden und jünger als 10 Minuten
    const now = Date.now();
    if (!forceRefresh && app.state.wetterCache && (now - app.state.wetterCache.timestamp < 600000))
    {
        app.logic.renderWetterUI(app.state.wetterCache.data);
        return;
    }

    // Standard-Fallback Koordinaten (Golfclub Bremer Schweiz / Schwanewede)
    const fallbackLat = 53.2217;
    const fallbackLon = 8.5831;

    const fetchForecast = async function(lat, lon, locationName = "Aktueller Standort")
    {
        try
        {
            const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&wind_speed_unit=kmh&timezone=auto`;
            
            const response = await fetch(apiUrl);
            if (!response.ok) 
            {
                throw new Error("Wetter-API Antwort fehlerhaft");
            }

            const data = await response.json();
            data.locationName = locationName;

            app.state.wetterCache = {
                timestamp: Date.now(),
                data: data
            };

            app.logic.renderWetterUI(data);
        }
        catch (err)
        {
            console.error("[Wetter Modul] Fehler beim Abrufen:", err);
            if (container)
            {
                container.innerHTML = `
                    <div class="bg-red-50 border border-red-200 rounded-2xl p-5 text-center text-red-800 space-y-2">
                        <i class="fas fa-circle-exclamation text-2xl text-red-600"></i>
                        <p class="text-xs font-bold">Wetterdaten konnten nicht geladen werden.</p>
                        <p class="text-[10px] text-red-600">Prüfe deine Internetverbindung.</p>
                    </div>
                `;
            }
        }
        finally
        {
            if (refreshIcon) 
            {
                refreshIcon.classList.remove('fa-spin');
            }
        }
    };

    if (navigator.geolocation)
    {
        navigator.geolocation.getCurrentPosition(
            function(pos)
            {
                fetchForecast(pos.coords.latitude, pos.coords.longitude, "Dein Platzstandort");
            },
            function(err)
            {
                console.warn("[GPS] Zugriff verweigert / fehlgeschlagen. Verwende Standard-Koordinaten.", err);
                fetchForecast(fallbackLat, fallbackLon, "Bremer Schweiz (Default)");
            },
            { timeout: 8000 }
        );
    }
    else
    {
        fetchForecast(fallbackLat, fallbackLon, "Bremer Schweiz (Default)");
    }
};

// Rendert das Wetter-UI im Apple-Design
app.logic.renderWetterUI = function(data)
{
    const container = document.getElementById('wetter-content-container');
    if (!container) 
    {
        return;
    }

    const current = data.current || {};
    const hourly = data.hourly || {};

    const temp = Math.round(current.temperature_2m || 0);
    const gefuehlt = Math.round(current.apparent_temperature || temp);
    const windKmH = Math.round(current.wind_speed_10m || 0);
    const windBöen = Math.round(current.wind_gusts_10m || windKmH);
    const windDirDeg = current.wind_direction_10m || 0;
    const windDirText = app.logic.getWindDirectionText(windDirDeg);
    const humidity = current.relative_humidity_2m || 0;
    const wmoInfo = app.logic.getWmoWeatherInfo(current.weather_code || 0);

    // Golf-Empfehlung berechnen
    const advice = app.logic.getGolfWeatherAdvice(temp, windKmH, current.precipitation || 0);

    // Stunden-Timeline aufbereiten (nächste 8 Stunden)
    let hourlyHtml = "";
    if (hourly.time && hourly.time.length > 0)
    {
        const currentHourIdx = new Date().getHours();
        const nextHours = hourly.time.slice(currentHourIdx, currentHourIdx + 8);

        hourlyHtml = nextHours.map(
            function(timeStr, idx)
            {
                const hourIndex = currentHourIdx + idx;
                const hTemp = Math.round(hourly.temperature_2m[hourIndex] || 0);
                const hRainProb = hourly.precipitation_probability[hourIndex] || 0;
                const hWind = Math.round(hourly.wind_speed_10m[hourIndex] || 0);
                const hCode = hourly.weather_code[hourIndex] || 0;
                const hWmo = app.logic.getWmoWeatherInfo(hCode);
                
                const timeFormatted = timeStr.split('T')[1]?.substring(0, 5) || `${idx}:00`;

                return `
                    <div class="flex flex-col items-center p-2.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl min-w-[72px] text-center shrink-0">
                        <span class="text-[10px] font-bold text-zinc-400">${timeFormatted}</span>
                        <i class="fas ${hWmo.icon} ${hWmo.color} text-lg my-2"></i>
                        <span class="text-xs font-black text-zinc-800">${hTemp}°C</span>
                        <span class="text-[9px] font-bold text-blue-600 mt-1"><i class="fas fa-droplet text-[8px] mr-0.5"></i>${hRainProb}%</span>
                        <span class="text-[9px] font-medium text-zinc-400 mt-0.5"><i class="fas fa-wind text-[8px] mr-0.5"></i>${hWind}</span>
                    </div>
                `;
            }
        ).join('');
    }

    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            
            <!-- Main Weather Card -->
            <div class="bg-gradient-to-br from-zinc-900 via-emerald-950 to-zinc-900 text-white p-6 rounded-3xl shadow-xl border border-emerald-800/40 relative overflow-hidden">
                <div class="flex justify-between items-start relative z-10">
                    <div>
                        <span class="text-[10px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full tracking-wider">
                            <i class="fas fa-location-dot mr-1"></i> ${data.locationName}
                        </span>
                        <h3 class="text-3xl font-black text-white mt-3">${temp}°C</h3>
                        <p class="text-xs text-emerald-200/80 font-medium mt-0.5">Gefühlt wie ${gefuehlt}°C &bull; ${wmoInfo.text}</p>
                    </div>
                    <div class="text-right">
                        <i class="fas ${wmoInfo.icon} text-5xl text-amber-400 filter drop-shadow-md"></i>
                    </div>
                </div>

                <!-- Wind & Details Grid -->
                <div class="grid grid-cols-3 gap-2 pt-5 border-t border-white/10 mt-5 text-center relative z-10">
                    <div class="bg-white/5 backdrop-blur-md p-2.5 rounded-2xl border border-white/10">
                        <span class="block text-[9px] font-extrabold text-emerald-300 uppercase">Wind</span>
                        <span class="text-xs font-black text-white mt-0.5 block flex items-center justify-center gap-1">
                            <i class="fas fa-location-arrow text-[10px]" style="transform: rotate(${windDirDeg - 45}deg)"></i>
                            ${windKmH} <span class="text-[9px] font-normal text-zinc-400">km/h</span>
                        </span>
                        <span class="text-[8px] text-zinc-400 block mt-0.5">${windDirText} (Böen ${windBöen})</span>
                    </div>

                    <div class="bg-white/5 backdrop-blur-md p-2.5 rounded-2xl border border-white/10">
                        <span class="block text-[9px] font-extrabold text-emerald-300 uppercase">Niederschlag</span>
                        <span class="text-xs font-black text-white mt-0.5 block">${current.precipitation || 0} <span class="text-[9px] font-normal text-zinc-400">mm</span></span>
                        <span class="text-[8px] text-zinc-400 block mt-0.5">Letzte Std.</span>
                    </div>

                    <div class="bg-white/5 backdrop-blur-md p-2.5 rounded-2xl border border-white/10">
                        <span class="block text-[9px] font-extrabold text-emerald-300 uppercase">Luftfeuchte</span>
                        <span class="text-xs font-black text-white mt-0.5 block">${humidity}%</span>
                        <span class="text-[8px] text-zinc-400 block mt-0.5">Relativ</span>
                    </div>
                </div>
            </div>

            <!-- Golf-Assessment Banner -->
            <div class="p-4 ${advice.bg} border rounded-2xl flex items-center space-x-3.5 shadow-2xs">
                <div class="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center text-lg shrink-0 shadow-3xs">
                    <i class="fas ${advice.icon}"></i>
                </div>
                <div>
                    <h4 class="font-black text-xs uppercase tracking-wide">${advice.title}</h4>
                    <p class="text-xs mt-0.5 opacity-90">${advice.desc}</p>
                </div>
            </div>

            <!-- Hourly Forecast Timeline -->
            <div class="space-y-2">
                <h4 class="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider px-1">Runden-Vorhersage (Nächste Stunden)</h4>
                <div class="flex space-x-2 overflow-x-auto pb-2 scrollbar-none">
                    ${hourlyHtml}
                </div>
            </div>
        </div>
    `;
};

// ==========================================
// WETTER HILFSFUNKTIONEN
// ==========================================

app.logic.getWindDirectionText = function(degree)
{
    const directions = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(degree / 45) % 8;
    return directions[idx];
};

app.logic.getWmoWeatherInfo = function(code)
{
    const wmoMap = {
        0: { text: "Sonnig & Klar", icon: "fa-sun", color: "text-amber-500" },
        1: { text: "Meist sonnig", icon: "fa-sun-cloud", color: "text-amber-400" },
        2: { text: "Teilweise bewölkt", icon: "fa-cloud-sun", color: "text-stone-400" },
        3: { text: "Bedeckt", icon: "fa-cloud", color: "text-stone-500" },
        45: { text: "Nebel auf dem Platz", icon: "fa-smog", color: "text-stone-400" },
        51: { text: "Leichter Sprühregen", icon: "fa-cloud-rain", color: "text-blue-400" },
        61: { text: "Leichter Regen", icon: "fa-cloud-rain", color: "text-blue-500" },
        63: { text: "Mäßiger Regen", icon: "fa-cloud-showers-heavy", color: "text-blue-600" },
        80: { text: "Regenschauer", icon: "fa-cloud-sun-rain", color: "text-blue-500" },
        95: { text: "Gewittergefahr", icon: "fa-bolt", color: "text-amber-500" }
    };
    return wmoMap[code] || { text: "Wechselhaft", icon: "fa-cloud-sun", color: "text-stone-500" };
};

app.logic.getGolfWeatherAdvice = function(temp, windKmH, rainMm)
{
    if (rainMm > 1.0) 
    {
        return { title: "Nass auf dem Platz", desc: "Regenkleidung & Regenschirm einpacken.", bg: "bg-blue-50 border-blue-200 text-blue-900", icon: "fa-umbrella" };
    }
    if (windKmH > 28) 
    {
        return { title: "Starker Wind", desc: "Mindestens 1-2 Schläger mehr bei Gegenwind wählen.", bg: "bg-amber-50 border-amber-200 text-amber-900", icon: "fa-wind" };
    }
    if (temp > 27) 
    {
        return { title: "Sommerhitze", desc: "Genügend Wasser trinken & Sonnencreme auftragen.", bg: "bg-orange-50 border-orange-200 text-orange-900", icon: "fa-temperature-high" };
    }
    return { title: "Perfekte Bedingungen", desc: "Ideal für gute Drives & eine erfolgreiche Runde!", bg: "bg-emerald-50 border-emerald-200 text-emerald-900", icon: "fa-thumbs-up" };
};