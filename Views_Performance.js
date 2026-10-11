// =========================================================================
// LIE Scorecard - Meine Performance
// Views_Performance.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.views = app.views || {};
app.logic = app.logic || {};

app.logic.performanceNumber = function(value, digits)
{
    if (!Number.isFinite(value))
    {
        return '-';
    }

    return value.toLocaleString('de-DE', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
};

app.logic.performanceDate = function(value)
{
    if (!value)
    {
        return '-';
    }

    const parts = String(value).split('-');
    return parts.length === 3 ? parts[2] + '.' + parts[1] + '.' + parts[0] : value;
};

app.logic.renderHcpPerformanceChart = function(series)
{
    const points = (series || []).filter(function(item)
    {
        return Number.isFinite(item.hcpEnd);
    });

    if (points.length === 0)
    {
        return '<div class="py-8 text-center text-xs text-zinc-400">Noch keine HCP-Historie vorhanden.</div>';
    }

    const values = points.map(function(item)
    {
        return item.hcpEnd;
    });
    const min = Math.min.apply(null, values) - 1;
    const max = Math.max.apply(null, values) + 1;
    const range = Math.max(1, max - min);
    const width = 620;
    const height = 180;
    const padX = 28;
    const padY = 22;
    const usableWidth = width - (padX * 2);
    const usableHeight = height - (padY * 2);

    const coords = points.map(function(item, index)
    {
        const x = points.length === 1
            ? width / 2
            : padX + ((index / (points.length - 1)) * usableWidth);
        const y = padY + (((max - item.hcpEnd) / range) * usableHeight);
        return { x: x, y: y, item: item };
    });

    const polyline = coords.map(function(point)
    {
        return point.x.toFixed(1) + ',' + point.y.toFixed(1);
    }).join(' ');

    const circles = coords.map(function(point)
    {
        const title = point.item.isSeasonStart
            ? app.logic.performanceDate(point.item.date) + ' · Saisonstart · LIE-HCP ' + point.item.hcpEnd
            : app.logic.performanceDate(point.item.date) + ' · ' + point.item.courseName + ' · HCP ' + point.item.hcpStart + ' → ' + point.item.hcpEnd;
        return '<circle cx="' + point.x + '" cy="' + point.y + '" r="6" fill="#047857" stroke="white" stroke-width="3"><title>' + title + '</title></circle>';
    }).join('');

    const labels = coords.map(function(point, index)
    {
        if (coords.length > 6 && index !== 0 && index !== coords.length - 1 && index % Math.ceil(coords.length / 5) !== 0)
        {
            return '';
        }
        return '<text x="' + point.x + '" y="174" text-anchor="middle" font-size="10" fill="#71717a">' + app.logic.performanceDate(point.item.date).slice(0, 5) + '</text>';
    }).join('');

    return `
        <div class="overflow-x-auto">
            <svg viewBox="0 0 ${width} ${height}" class="w-full min-w-[520px] h-auto" role="img" aria-label="LIE-HCP Verlauf">
                <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" stroke="#e4e4e7" />
                <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="#e4e4e7" />
                <polyline points="${polyline}" fill="none" stroke="#059669" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
                ${circles}
                ${labels}
            </svg>
        </div>
    `;
};

app.logic.renderPerformancePuttBars = function(stats)
{
    const withPutts = (stats || []).filter(function(item)
    {
        return Number.isFinite(item.avgPutts);
    });

    if (withPutts.length === 0)
    {
        return '<div class="py-6 text-center text-xs text-zinc-400">Noch keine Putt-Daten vorhanden.</div>';
    }

    const max = Math.max.apply(null, withPutts.map(function(item)
    {
        return item.avgPutts;
    }).concat([3]));

    return `
        <div class="flex items-end gap-1.5 h-44 pt-6 overflow-x-auto pb-1">
            ${withPutts.map(function(item)
            {
                const height = Math.max(10, (item.avgPutts / max) * 120);
                return `
                    <div class="flex flex-col items-center justify-end min-w-[28px] h-full" title="${item.courseName}, Bahn ${item.hole}: Ø ${app.logic.performanceNumber(item.avgPutts, 1)} Putts">
                        <span class="text-[9px] font-bold text-zinc-600 mb-1">${app.logic.performanceNumber(item.avgPutts, 1)}</span>
                        <div class="w-5 rounded-t-md bg-emerald-600" style="height:${height}px"></div>
                        <span class="text-[9px] font-bold text-zinc-500 mt-1">${item.hole}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
};

app.logic.selectPerformancePlayer = function(playerId)
{
    if (!app.state.currentUser || app.state.currentUser.role !== 'Admin')
    {
        return;
    }

    app.state.performancePlayerId = String(playerId || app.state.currentUser.id);
    app.router.navigate('performance');
};

app.views.performance = function()
{
    const user = app.state.currentUser;

    if (!user)
    {
        return '<div class="p-6 text-center text-sm text-zinc-500">Keine persönlichen Daten verfügbar.</div>';
    }

    const isAdmin = user.role === 'Admin';
    const requestedPlayerId = isAdmin && app.state.performancePlayerId
        ? String(app.state.performancePlayerId)
        : String(user.id);
    const selectedPlayer = isAdmin
        ? ((app.state.spieler || []).find(function(player)
        {
            return String(player.id) === requestedPlayerId;
        }) || user)
        : user;
    const data = app.logic.getPersonalPerformance(selectedPlayer);

    if (!data)
    {
        return '<div class="p-6 text-center text-sm text-zinc-500">Keine persönlichen Daten verfügbar.</div>';
    }

    const nickname = selectedPlayer.nickname || selectedPlayer.name || 'Spieler';
    const adminPlayers = isAdmin
        ? (app.state.spieler || []).filter(function(player)
        {
            return player && !player.istGeloescht && String(player.istGeloescht).toUpperCase() !== 'TRUE';
        }).slice().sort(function(a, b)
        {
            return String(a.nickname || a.name || '').localeCompare(String(b.nickname || b.name || ''), 'de');
        })
        : [];
    const hcpChangeText = data.hcpChange === null
        ? '-'
        : ((data.hcpChange > 0 ? '+' : '') + app.logic.performanceNumber(data.hcpChange, 0));
    const bestRoundText = data.bestRound ? data.bestRound.netto + ' Pkt.' : '-';
    const avgPutts = data.avgPutts === null ? '-' : app.logic.performanceNumber(data.avgPutts, 1);
    const puttDenominator = Math.max(1, data.onePutts + data.twoPutts + data.threePlusPutts);
    const onePuttPct = Math.round((data.onePutts / puttDenominator) * 100);
    const twoPuttPct = Math.round((data.twoPutts / puttDenominator) * 100);
    const threePuttPct = Math.round((data.threePlusPutts / puttDenominator) * 100);
    const seasonYear = data.seasonStart ? parseInt(String(data.seasonStart).slice(0, 4)) : new Date().getFullYear();
    const seasonLabel = 'Saison ' + seasonYear + '/' + String(seasonYear + 1).slice(-2);

    const kpi = function(icon, label, value, sub)
    {
        return `
            <div class="bg-white border border-zinc-200 rounded-2xl p-3 shadow-xs min-h-[92px] flex flex-col justify-between">
                <div class="flex items-center gap-2 text-emerald-800">
                    <i class="fas ${icon} text-sm"></i>
                    <span class="text-[10px] font-bold uppercase tracking-wide text-zinc-500">${label}</span>
                </div>
                <div>
                    <div class="text-xl font-black text-zinc-900">${value}</div>
                    <div class="text-[9px] text-zinc-400 font-medium">${sub || '&nbsp;'}</div>
                </div>
            </div>
        `;
    };

    const bestHole = data.bestHole;
    const worstHole = data.worstHole;
    const bestPuttingRound = data.bestPuttingRound;

    return `
        <div class="space-y-4 max-w-3xl mx-auto pb-16 animate-fade-in">
            <div class="flex items-center justify-between border-b border-zinc-200 pb-3">
                <div class="flex items-center gap-2.5">
                    <button onclick="app.router.navigate('live_dashboard')" class="text-zinc-500 touch-target" title="Zurück zu den Saison-Stats">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h2 class="text-xl font-black text-zinc-900 tracking-tight">Meine Performance</h2>
                        <p class="text-xs text-zinc-400 font-medium">${nickname} · ${seasonLabel}</p>
                    </div>
                </div>
                <div class="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <i class="fas fa-chart-line"></i>
                </div>
            </div>

            ${isAdmin ? `
                <section class="bg-amber-50 border border-amber-200 rounded-2xl p-3 shadow-xs">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                            <i class="fas fa-user-shield"></i>
                        </div>
                        <div>
                            <div class="text-[10px] font-black uppercase tracking-wide text-amber-800">Admin-Auswertung</div>
                            <div class="text-[9px] text-amber-700">Performance eines Spielers anzeigen</div>
                        </div>
                    </div>
                    <select onchange="app.logic.selectPerformancePlayer(this.value)" class="w-full bg-white border border-amber-200 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-800 outline-none focus:border-amber-500">
                        ${adminPlayers.map(function(player)
                        {
                            const playerName = player.nickname || player.name || ('Spieler ' + player.id);
                            const selected = String(player.id) === String(selectedPlayer.id) ? ' selected' : '';
                            return '<option value="' + player.id + '"' + selected + '>' + playerName + '</option>';
                        }).join('')}
                    </select>
                </section>
            ` : ''}

            ${data.roundsCount === 0 ? `
                <section class="bg-white border border-emerald-200 rounded-3xl p-6 text-center shadow-xs">
                    <div class="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-2xl">
                        <i class="fas fa-golf-ball-tee"></i>
                    </div>
                    <h3 class="font-black text-zinc-900 mt-3">Noch keine Runde in dieser Saison</h3>
                    <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Für ${nickname} erscheint die persönliche Performance hier nach der ersten abgeschlossenen Runde.</p>
                </section>
            ` : ''}

            <section class="space-y-2">
                <div class="bg-gradient-to-r from-emerald-800 to-teal-700 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
                    <span class="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-black">1</span>
                    <h3 class="font-black">Meine Saison</h3>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    ${kpi('fa-flag', 'Runden', data.roundsCount, 'beendet & gültig')}
                    ${kpi('fa-golf-ball', 'Löcher', data.holesCount, 'gespielt')}
                    ${kpi('fa-trophy', 'LIE-HCP', app.logic.performanceNumber(data.startHcp, 0) + ' → ' + app.logic.performanceNumber(data.currentHcp, 0), hcpChangeText + ' seit Saisonstart')}
                    ${kpi('fa-chart-bar', 'Beste Runde', bestRoundText, data.bestRound ? (data.bestRound.holes + ' Loch · ' + data.bestRound.courseName) : '')}
                    ${kpi('fa-golf-ball-tee', 'Ø Putts', avgPutts, 'pro erfasstem Loch')}
                    ${kpi('fa-bullseye', 'Ø Netto', data.roundsCount > 0 ? app.logic.performanceNumber(data.rounds.reduce(function(sum, item) { return sum + item.netto; }, 0) / data.roundsCount, 1) : '-', 'Stableford pro Runde')}
                </div>
            </section>

            <section class="space-y-2">
                <div class="bg-gradient-to-r from-emerald-800 to-teal-700 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
                    <span class="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-black">2</span>
                    <h3 class="font-black">Mein LIE-HCP</h3>
                </div>
                <div class="bg-white border border-zinc-200 rounded-2xl p-3 shadow-xs">
                    <p class="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1">Entwicklung über die Saison</p>
                    ${app.logic.renderHcpPerformanceChart(data.hcpSeries)}
                    <div class="space-y-1 mt-2">
                        ${data.hcpSeries.slice().reverse().slice(0, 6).map(function(item)
                        {
                            const hcpText = item.isSeasonStart
                                ? 'LIE-HCP ' + (item.hcpEnd ?? '-')
                                : (item.hcpStart ?? '-') + ' → ' + (item.hcpEnd ?? '-');

                            return `
                                <div class="grid grid-cols-[72px_1fr_auto] gap-2 items-center text-[10px] border-t border-zinc-100 pt-1.5">
                                    <span class="text-zinc-500">${app.logic.performanceDate(item.date)}</span>
                                    <span class="font-semibold text-zinc-700 truncate">${item.courseName}</span>
                                    <span class="font-black text-emerald-800">${hcpText}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </section>

            <section class="space-y-2">
                <div class="bg-gradient-to-r from-emerald-800 to-teal-700 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
                    <span class="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-black">3</span>
                    <h3 class="font-black">Mein Spiel</h3>
                </div>
                <div class="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
                    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                        ${[
                            ['🐦', 'Birdies', data.birdies],
                            ['🚩', 'Pars', data.pars],
                            ['⬆️', 'Bogeys', data.bogeys],
                            ['⏫', 'Doppel+', data.doublePlus],
                            ['❌', 'Striche', data.striche],
                            ['🍻', 'Ladies', data.ladies]
                        ].map(function(item)
                        {
                            return `<div class="rounded-xl bg-zinc-50 border border-zinc-100 p-2"><div class="text-lg">${item[0]}</div><div class="text-lg font-black text-zinc-900">${item[2]}</div><div class="text-[9px] font-bold text-zinc-500">${item[1]}</div></div>`;
                        }).join('')}
                    </div>
                </div>
            </section>

            <section class="space-y-2">
                <div class="bg-gradient-to-r from-emerald-800 to-teal-700 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
                    <span class="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-black">4</span>
                    <h3 class="font-black">Mein Putting</h3>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    ${kpi('fa-golf-ball-tee', 'Ø Putts', avgPutts, 'pro Loch')}
                    ${kpi('fa-flag', '1-Putt', onePuttPct + '%', data.onePutts + ' Löcher')}
                    ${kpi('fa-circle-dot', '2-Putt', twoPuttPct + '%', data.twoPutts + ' Löcher')}
                    ${kpi('fa-ellipsis', '3+ Putts', threePuttPct + '%', data.threePlusPutts + ' Löcher')}
                </div>
                <div class="bg-white border border-zinc-200 rounded-2xl p-3 shadow-xs">
                    <div class="flex items-center justify-between gap-2">
                        <div>
                            <h4 class="text-xs font-black text-zinc-800">Ø Putts je Bahn</h4>
                            <p class="text-[9px] text-zinc-400">Platz + Bahn werden getrennt ausgewertet</p>
                        </div>
                    </div>
                    ${app.logic.renderPerformancePuttBars(data.holeStatsList)}
                </div>
            </section>

            <section class="space-y-2">
                <div class="bg-gradient-to-r from-emerald-800 to-teal-700 text-white rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
                    <span class="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-black">5</span>
                    <h3 class="font-black">Meine Stärken & Baustellen</h3>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                        <div class="text-[10px] font-bold text-emerald-800"><i class="fas fa-thumbs-up mr-1"></i> Beste Bahn</div>
                        <div class="text-lg font-black text-emerald-950 mt-1">${bestHole ? 'Bahn ' + bestHole.hole : '-'}</div>
                        <div class="text-xs font-bold text-emerald-800">${bestHole ? ((bestHole.avgRelativeToPar >= 0 ? '+' : '') + app.logic.performanceNumber(bestHole.avgRelativeToPar, 1)) : '-'} Ø über Par</div>
                        <div class="text-[9px] text-emerald-700 mt-1 truncate">${bestHole ? bestHole.courseName + ' · ' + bestHole.plays + '× gespielt' : ''}</div>
                    </div>
                    <div class="bg-red-50 border border-red-200 rounded-2xl p-3">
                        <div class="text-[10px] font-bold text-red-800"><i class="fas fa-circle-exclamation mr-1"></i> Schwierigste Bahn</div>
                        <div class="text-lg font-black text-red-950 mt-1">${worstHole ? 'Bahn ' + worstHole.hole : '-'}</div>
                        <div class="text-xs font-bold text-red-800">${worstHole ? ((worstHole.avgRelativeToPar >= 0 ? '+' : '') + app.logic.performanceNumber(worstHole.avgRelativeToPar, 1)) : '-'} Ø über Par</div>
                        <div class="text-[9px] text-red-700 mt-1 truncate">${worstHole ? worstHole.courseName + ' · ' + worstHole.plays + '× gespielt' : ''}</div>
                    </div>
                </div>
                <div class="bg-white border border-zinc-200 rounded-2xl divide-y divide-zinc-100 shadow-xs">
                    <div class="p-3 flex justify-between gap-3 text-xs"><span class="font-bold text-zinc-600">🏆 Beste Runde</span><span class="font-black text-zinc-900 text-right">${data.bestRound ? data.bestRound.netto + ' Pkt. · ' + app.logic.performanceDate(data.bestRound.date) : '-'}</span></div>
                    <div class="p-3 flex justify-between gap-3 text-xs"><span class="font-bold text-zinc-600">⛳ Wenigste Putts</span><span class="font-black text-zinc-900 text-right">${bestPuttingRound ? bestPuttingRound.putts + ' Putts · ' + bestPuttingRound.holes + ' Loch' : '-'}</span></div>
                    <div class="p-3 flex justify-between gap-3 text-xs"><span class="font-bold text-zinc-600">🐦 Birdies</span><span class="font-black text-zinc-900">${data.birdies}</span></div>
                    <div class="p-3 flex justify-between gap-3 text-xs"><span class="font-bold text-zinc-600">🚩 Pars</span><span class="font-black text-zinc-900">${data.pars}</span></div>
                </div>
            </section>

            <section class="bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-200 rounded-3xl p-4 shadow-xs relative overflow-hidden">
                <div class="absolute -right-4 -bottom-6 text-7xl opacity-10">🎄</div>
                <div class="relative">
                    <div class="flex items-center gap-2 text-blue-900">
                        <i class="fas fa-file-pdf"></i>
                        <h3 class="font-black">Mein Saisonbericht</h3>
                    </div>
                    <p class="text-xs text-zinc-600 mt-2 max-w-md">Deine komplette Saison als PDF – zum Herunterladen oder per E-Mail.</p>
                    <button disabled class="mt-3 bg-white/80 border border-blue-200 text-blue-800 px-3 py-2 rounded-xl text-xs font-black opacity-80 cursor-not-allowed">🎄 Demnächst …</button>
                </div>
            </section>
        </div>
    `;
};
