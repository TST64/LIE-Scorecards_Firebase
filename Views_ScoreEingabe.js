// LIE 6.0: presentation and deliberate input only. Existing V1 transport is unchanged.
app.views = app.views || {};

app.logic.scoreScreenEscape = function(value)
{
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(character)
    {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
};

app.logic.scoreScreenContext = function(id, hole)
{
    const state = app.state.scoreEntryV2;
    if (!state || state.status !== 'ready' || state.id !== String(id)
        || state.owner !== String(app.state.currentUser && app.state.currentUser.id))
    {
        return null;
    }
    const response = state.response;
    const holes = response.round.holes;
    const nr = Math.max(holes[0], Math.min(holes[holes.length - 1], Number(hole) || holes[0]));
    return { id: String(id), owner: state.owner, round: response.round,
        course: response.course, flight: { id: response.flightId }, seq: response.flightSeq,
        leader: ['Admin', 'Spielleiter'].includes(app.state.currentUser.role),
        flights: [{ id: response.flightId, seq: response.flightSeq }], players: response.members,
        first: holes[0], last: holes[holes.length - 1], hole: nr,
        current: response.round.holeData.find(function(item)
        {
            return item.nr === nr;
        }) };
};

app.logic.scoreScreenEntry = function(context, playerId, hole)
{
    const raw = app.state.scoreEntryV2.entries[playerId + '_' + hole];
    const holeData = app.state.scoreEntryV2.response.round.holeData.find(function(item)
    {
        return item.nr === hole;
    });
    return app.scoreEntryV2Controller.project(raw, holeData);
};

app.logic.scoreScreenHoleState = function(context, hole)
{
    const complete = context.players.length > 0 && context.players.every(function(id)
    {
        return app.logic.scoreScreenEntry(context, id, hole).confirmed;
    });
    const scope = JSON.stringify([context.owner, context.id, context.flight.id]);
    const visited = (app.state.scoreScreenVisits || {})[scope] || {};
    return complete ? 'complete' : (visited[hole] && hole !== context.hole ? 'incomplete' : 'open');
};

app.logic.scoreScreenLoadV2 = function(id)
{
    const owner = String(app.state.currentUser && app.state.currentUser.id);
    const state = { id: String(id), owner: owner, status: 'loading' };
    app.state.scoreEntryV2 = state;
    app.scoreEntryV2Controller = app.scoreEntryV2Controller || app.createFirebaseScoreEntryV2Controller();
    app.logic.scoreScreenReady = (async function()
    {
        try
        {
            try
            {
                state.response = await app.scoreEntryV2Controller.open(
                {
                    spieltagId: String(id), offline: typeof navigator !== 'undefined' && navigator.onLine === false
                });
            }
            catch (error)
            {
                if (error.code !== 'functions/unavailable' && error.code !== 'unavailable')
                {
                    throw error;
                }
                // Connectivity failure only: never bypass identity/authorization/read validation errors.
                state.response = await app.scoreEntryV2Controller.open({ spieltagId: String(id), offline: true });
            }
            state.entries = await app.scoreEntryV2Controller.readAll();
            state.status = 'ready';
        }
        catch (error)
        {
            state.status = 'error';
            state.error = error;
            if (app.logic.showToast)
            {
                app.logic.showToast('Score-Eingabe nicht verfügbar: ' + error.message, 'error');
            }
        }
        const selection = app.state.scoreScreenSelection;
        if (app.state.scoreEntryV2 === state && selection && selection.id === String(id)
            && selection.owner === owner && app.state.currentView === 'score_eingabe')
        {
            const container = document.getElementById('app-container');
            if (container)
            {
                container.innerHTML = app.views.score_eingabe(id, selection.hole);
            }
        }
    })();
};

app.logic.scoreScreenInput = function(playerId, action, delta)
{
    const c = app.state.scoreScreenContext;
    const selection = app.state.scoreScreenSelection;
    if (!c || !selection || c.owner !== String(app.state.currentUser && app.state.currentUser.id)
        || !c.players.includes(String(playerId)) || app.state.currentView !== 'score_eingabe')
    {
        return Promise.resolve();
    }
    const state = app.state.scoreEntryV2;
    state.actionVersion = (state.actionVersion || 0) + 1;
    const version = state.actionVersion;
    const focus = document.activeElement && document.activeElement.id;
    return (async function()
    {
        let raw;
        try
        {
            raw = await app.scoreEntryV2Controller.action(String(playerId), c.hole, action, delta);
        }
        catch (error)
        {
            if (app.logic.showToast && state.owner === String(app.state.currentUser && app.state.currentUser.id))
            {
                app.logic.showToast(error.localCommit
                    ? 'Eingabe lokal gespeichert; Ansicht bitte erneut öffnen.'
                    : 'Eingabe nicht gespeichert: ' + error.message, 'error');
            }
        }
        try
        {
            raw = raw || await app.scoreEntryV2Controller.readEntry(String(playerId), c.hole);
            if (state !== app.state.scoreEntryV2
                || state.owner !== String(app.state.currentUser && app.state.currentUser.id))
            {
                return;
            }
            state.entries[playerId + '_' + c.hole] = raw;
            if (version !== state.actionVersion || app.state.currentView !== 'score_eingabe' || app.state.scoreScreenSelection !== selection)
            {
                return;
            }
            const container = document.getElementById('app-container');
            if (container)
            {
                container.innerHTML = app.views.score_eingabe(c.id, c.hole);
                const target = focus && document.getElementById(focus);
                if (target)
                {
                    target.focus({ preventScroll: true });
                }
            }
        }
        catch (error)
        {
            // Never project an obsolete context over a newly selected round/user.
        }
    })();
};

app.views.scoreEingabe = app.views.score_eingabe = function(id, hole, seq)
{
    if (id && typeof id === 'object')
    {
        seq = id.flightSeq || id.targetFlightSeq;
        hole = id.hole || id.holeNumber;
        id = id.id || id.spieltagId;
    }
    const owner = String(app.state.currentUser && app.state.currentUser.id);
    app.state.scoreScreenSelection = { id: String(id), hole: hole, owner: owner };
    const local = app.state.scoreEntryV2;
    if (!local || local.id !== String(id) || local.owner !== owner || local.needsReload)
    {
        app.logic.scoreScreenLoadV2(id);
    }
    if (app.state.scoreEntryV2.status === 'loading')
    {
        return '<div class="lie-score-screen" aria-busy="true"><p>Scorekarte wird geladen …</p></div>';
    }
    const c = app.logic.scoreScreenContext(id, hole, seq);
    if (!c)
    {
        return '<div class="lie-score-screen"><h2>Score-Eingabe nicht verfügbar</h2><p>Flight oder echte Bahndaten fehlen. Bitte die Spielleitung fragen.</p><button class="lie-button" onclick="app.router.navigate(\'dashboard\')">Zur Startseite</button></div>';
    }
    c.owner = String(app.state.currentUser.id);
    app.state.scoreScreenContext = c;
    const scope = JSON.stringify([c.owner, c.id, c.flight.id]);
    app.state.scoreScreenVisits = app.state.scoreScreenVisits || {};
    app.state.scoreScreenVisits[scope] = app.state.scoreScreenVisits[scope] || {};
    app.state.scoreScreenVisits[scope][c.hole] = true;
    const esc = app.logic.scoreScreenEscape;
    const arg = function(value)
    {
        return esc(JSON.stringify(value));
    };
    const navigate = function(nr, flight)
    {
        return 'app.router.navigate(\'score_eingabe\', {id:' + arg(c.id) + ',hole:' + nr + ',flightSeq:' + (flight || c.seq) + '})';
    };
    let progress = '';
    const labels = { complete: 'vollständig', incomplete: 'verlassen, unvollständig', open: 'offen' };
    for (let nr = 1; nr <= 18; nr++)
    {
        const outside = nr < c.first || nr > c.last;
        const state = outside ? 'outside' : app.logic.scoreScreenHoleState(c, nr);
        progress += '<button class="lie-hole lie-hole--' + state + (nr === c.hole ? ' lie-hole--current' : '')
            + '" ' + (outside ? 'disabled' : 'onclick="' + navigate(nr) + '"')
            + (nr === c.hole ? ' aria-current="step"' : '') + ' aria-label="Loch ' + nr + ', '
            + (outside ? 'nicht Teil dieser Runde' : labels[state]) + (nr === c.hole ? ', aktuell' : '')
            + '"><span class="lie-hole-number">' + nr + '</span><span class="lie-hole-marker" aria-hidden="true">'
            + (state === 'complete' ? '✓' : (state === 'incomplete' ? '!' : '·')) + '</span></button>';
    }
    // Presentation only: follow the actual app header, including responsive height changes.
    const header = typeof document.querySelector === 'function' ? document.querySelector('body > header') : null;
    const container = document.getElementById('app-container');
    if (header && container)
    {
        const updateHeaderHeight = function()
        {
            container.style.setProperty('--lie-header-height', header.getBoundingClientRect().height + 'px');
        };
        updateHeaderHeight();
        if (typeof ResizeObserver !== 'undefined' && !app.views.scoreScreenHeaderObserver)
        {
            app.views.scoreScreenHeaderObserver = new ResizeObserver(updateHeaderHeight);
            app.views.scoreScreenHeaderObserver.observe(header);
        }
    }
    const cards = c.players.map(function(playerId, playerIndex)
    {
        const player = app.state.scoreEntryV2.response.players.find(function(item)
        {
            return String(item.id) === playerId;
        });
        if (!player)
        {
            return '';
        }
        const entry = app.logic.scoreScreenEntry(c, playerId, c.hole);
        const name = player.nickname || player.name || playerId;
        const initials = String(name).trim().slice(0, 2).toUpperCase();
        const avatarUrl = player.avatarUrl || player.photoURL || '';
        const avatar = /^https?:\/\//i.test(avatarUrl)
            ? '<img src="' + esc(avatarUrl) + '" alt="" onerror="this.hidden=true" loading="lazy">' : '';
        const input = function(action, delta)
        {
            return 'app.logic.scoreScreenInput(' + arg(playerId) + ',' + arg(action) + ',' + (delta || 0) + ')';
        };
        const control = function(field, label, value)
        {
            return '<div class="lie-score-field"><div class="lie-stepper"><button id="lie-' + field + '-minus-' + esc(playerId) + '" aria-label="' + label + ' verringern für ' + esc(name)
                + '" onclick="' + input(field, -1) + '">−</button><div class="lie-score-value"><span class="lie-field-label">' + label + '</span><strong>' + value
                + '</strong></div><button id="lie-' + field + '-plus-' + esc(playerId) + '" aria-label="' + label + ' erhöhen für ' + esc(name)
                + '" onclick="' + input(field, 1) + '">+</button></div></div>';
        };
        return '<section class="lie-player' + (!entry.confirmed ? ' lie-player--open' : '') + '" aria-label="Spielerposition ' + (playerIndex + 1) + ': ' + esc(name) + '"><div class="lie-player-heading">'
            + '<span class="lie-player-position" aria-hidden="true">' + (playerIndex + 1) + '</span>'
            + '<button id="lie-avatar-' + esc(playerId) + '" class="lie-avatar" onclick="' + input('confirm') + '" '
            + (entry.confirmed ? 'disabled ' : '') + 'aria-label="Vorgabe Par und 2 Putts für ' + esc(name) + ' übernehmen"><span>' + esc(initials) + '</span>' + avatar + '</button>'
            + '<div class="lie-player-identity"><h3>' + esc(name) + '</h3><span class="lie-player-status"><span class="lie-status-icon" aria-hidden="true">' + (entry.confirmed ? '✓' : '●') + '</span>' + (entry.confirmed ? 'Eingegeben' : 'Noch offen') + '</span></div></div>'
            + '<div class="lie-score-controls">' + control('strokes', 'Schläge', entry.strokes) + control('puts', 'Putts', entry.puts) + '</div>'
            + '<div class="lie-checkboxes"><label><input id="lie-lady-' + esc(playerId) + '" type="checkbox" ' + (entry.lady ? 'checked ' : '') + 'onchange="' + input('lady') + '"> Lady</label>'
            + '<label><input id="lie-strich-' + esc(playerId) + '" type="checkbox" ' + (entry.maxscore ? 'checked ' : '') + 'onchange="' + input('strich') + '"> Strich</label></div></section>';
    }).join('');
    app.logic.openLeaderboardOverlay = function(stId) 
    {
        const mode = app.state.lastLeaderboardMode || 'netto';
        const html = app.views.leaderboard(stId, mode);
        
        const overlayContent = document.getElementById('overlay-leaderboard-content');
        if (overlayContent) 
        {
            overlayContent.innerHTML = html;
            const backBtn = overlayContent.querySelector('.fa-arrow-left')?.parentElement;
            if (backBtn) backBtn.style.display = 'none';
            const adminBox = overlayContent.querySelector('.fa-user-shield')?.parentElement;
            if (adminBox) adminBox.style.display = 'none';
        }
        
        document.getElementById('score-leaderboard-overlay').classList.remove('hidden');
    };


    return '<div class="lie-score-screen"><div class="lie-score-heading"><button class="lie-back" aria-label="Score-Eingabe verlassen" onclick="app.router.navigate(\'dashboard\')"><svg class="lie-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h1>Mein Flight</h1><span class="lie-course-context">'
        + esc(c.course ? c.course.name : 'Scorekarte') + ' · Flight ' + c.seq + '</span></div>'
        + '<div class="lie-hole-sticky"><nav class="lie-progress" aria-label="Lochfortschritt">' + progress + '</nav>'
        + '<div class="lie-hole-context"><div class="lie-hole-title"><button aria-label="Vorheriges Loch" ' + (c.hole === c.first ? 'disabled' : 'onclick="' + navigate(c.hole - 1) + '"') + '><svg class="lie-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h2>Loch ' + c.hole + ' von ' + c.last + '</h2><button aria-label="Nächstes Loch" ' + (c.hole === c.last ? 'disabled' : 'onclick="' + navigate(c.hole + 1) + '"') + '><svg class="lie-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></div><p>Par ' + esc(c.current.par) + ' · SI ' + esc(c.current.si) + '</p></div></div>'
        + '<div class="lie-players">' + cards + '</div>'
        + (c.leader ? '<details class="lie-management"><summary>Spielleitung</summary>' + c.flights.map(function(flight)
        {
            const n = flight.seq;
            return '<button class="lie-button" onclick="' + navigate(c.hole, n) + '">Flight ' + n + '</button>';
        }).join('') + '<button class="lie-button" onclick="app.router.navigate(\'score_schnellerfassung\',{id:' + arg(c.id) + ',flightSeq:' + c.seq + '})">Schnellerfassung</button>'
        + '<button class="lie-button" onclick="app.logic.openEditSpieltagModal(' + arg(c.id) + ',' + c.hole + ',' + c.seq + ')">Spieltag bearbeiten</button></details>' : '')
        + '<nav class="lie-round-nav" aria-label="Rundennavigation"><button ' + (c.hole === c.first ? 'disabled' : 'onclick="' + navigate(c.hole - 1) + '"') + '><svg class="lie-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg><span>Loch ' + (c.hole === c.first ? c.first : c.hole - 1) + '</span></button>'
        + '<button onclick="app.logic.openLeaderboardOverlay(' + arg(c.id) + ')"><svg class="lie-flight-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3"/><circle cx="4" cy="8" r="2"/><circle cx="20" cy="8" r="2"/><path d="M7 21v-5a5 5 0 0 1 10 0v5ZM1 20v-5a3 3 0 0 1 4-3v8ZM19 20v-8a3 3 0 0 1 4 3v5Z"/></svg><span>Flight / Live</span></button><button class="lie-next" '
        + (c.hole === c.last ? 'onclick="app.router.navigate(\'dashboard\')">Eingabe verlassen' : 'onclick="' + navigate(c.hole + 1) + '"><span>Loch ' + (c.hole + 1) + '</span><svg class="lie-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>') + '</button></nav></div>'
        + '<div id="score-leaderboard-overlay" class="lie-overlay hidden" role="dialog" aria-modal="true" aria-label="Flight und Live-Stand"><div class="lie-overlay-panel"><button class="lie-button" onclick="document.getElementById(\'score-leaderboard-overlay\').classList.add(\'hidden\')">Schließen</button><div id="overlay-leaderboard-content"></div></div></div>';
};
