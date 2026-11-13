// Read-only live presentation. Never imports local pending entries into rankings.
var app = app || {}; app.logic = app.logic || {};
(function()
{
    const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
        ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
    const requireValue = ok => { if (!ok) throw new Error('Unconfirmed leaderboard snapshot'); };

    app.logic.buildLiveLeaderboard = async function(publication, inspection, id)
    {
        requireValue(publication?.publication && !publication.publication.activeRun);
        const round = publication.spieltage.find(r => r.id === id);
        requireValue(round && !round.istGeloescht && inspection.spieltagId === id
            && round.status === inspection.status && (round.scoreRevision ?? 0) === inspection.scoreRevision);
        const ids = String(round.teilnehmerCsv).split(',').map(x => x.trim());
        LieHcpRules.validateRoundSnapshot(round, ids);
        const flights = publication.flights.filter(f => f.spieltagId === id)
            .map(f => ({id:f.id, members:String(f.spielerIdsCsv).split(',').map(x => x.trim())}))
            .sort((a,b) => a.id.localeCompare(b.id));
        const cards = publication.scorecards.filter(c => c.spieltagId === id).sort((a,b) => a.id.localeCompare(b.id));
        // Same canonical digest as the existing V2-validated closure inspection.
        // This binds every displayed raw hole to the server-verified generations,
        // immutable starts, flights and revision, including concurrent polling.
        const basis = {round:{hcpStart:round.hcpStart, holeAllowances:round.holeAllowances,
            hcpHoleData:round.hcpHoleData, hcpCourseTable:round.hcpCourseTable || [], type:round.rundenTyp}, flights, cards};
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
            new TextEncoder().encode(JSON.stringify(canonical(basis)))))).map(b => b.toString(16).padStart(2,'0')).join('');
        requireValue(digest === inspection.scoreDigest);
        const holes = LieHcpRules.played(round, round.hcpHoleData);
        requireValue(ids.length === inspection.results.length && new Set(ids).size === ids.length);
        const rows = ids.map(playerId =>
        {
            const result = inspection.results.find(r => r.playerId === playerId);
            requireValue(result?.valid && result.startHcp === round.hcpStart[playerId]);
            const player = publication.spieler.find(p => p.id === playerId);
            const scores = Object.fromEntries(cards.filter(c => c.spielerId === playerId).map(c => [c.hole, c]));
            return {id:playerId, name:player?.nickname || player?.name || playerId, scores, result};
        }).sort((a,b) => b.result.totalNetto - a.result.totalNetto || a.id.localeCompare(b.id));
        const published = round.status === 'Beendet' && inspection.published?.version === 1 ? inspection.published : null;
        if (published) requireValue(published.scoreDigest === digest && published.scoreRevision === inspection.scoreRevision);
        return {round, holes, flights, rows, published, scoreRevision:inspection.scoreRevision};
    };

    let live = null;
    function owns(s)
    {
        return live === s && String(app.state.currentUser?.id) === s.owner
            && firebase.auth().currentUser?.uid === s.owner
            && (s.target === 'overlay' ? !!document.getElementById('score-leaderboard-overlay')
                : app.state.currentView === 'leaderboard');
    }
    function paint(s)
    {
        if (!owns(s)) return;
        const target = document.getElementById(s.target === 'overlay' ? 'overlay-leaderboard-content' : 'app-container');
        if (!target || !app.views.leaderboard) return;
        // Preserve horizontal position and keyboard focus when a score arrives.
        const scroller = target.querySelector?.('.lie-live-table-wrap'), left = scroller?.scrollLeft || 0;
        const focus = document.activeElement?.id;
        target.innerHTML = app.views.leaderboard(s.id);
        const next = target.querySelector?.('.lie-live-table-wrap'); if (next) next.scrollLeft = left;
        if (focus) document.getElementById(focus)?.focus({preventScroll:true});
    }
    app.logic.stopLeaderboardLive = function()
    {
        if (live)
        {
            clearTimeout(live.timer);
            document.removeEventListener('visibilitychange', live.wake);
            if (typeof window !== 'undefined') window.removeEventListener('online', live.wake);
        }
        live = null; delete app.state.liveLeaderboard;
    };
    app.logic.startLeaderboardLive = function(id, target)
    {
        app.logic.stopLeaderboardLive();
        const s = live = {id:String(id), owner:String(app.state.currentUser?.id), target:target || 'page'};
        app.state.liveLeaderboard = {id:s.id, owner:s.owner, status:'loading', model:null};
        s.run = function()
        {
            if (!owns(s)) return Promise.resolve();
            if (s.busy) return s.busy;
            clearTimeout(s.timer);
            s.busy = (async function()
            {
                try
                {
                    if (navigator.onLine === false) throw new Error('Offline');
                    const publication = await app.logic.callFunction('readPublishedSeasonV1', {});
                    if (!owns(s)) return;
                    const inspection = await app.logic.callFunction('roundClosureV1', {action:'inspect', spieltagId:s.id});
                    const model = await app.logic.buildLiveLeaderboard(publication, inspection, s.id);
                    if (!owns(s)) return;
                    app.state.liveLeaderboard = {id:s.id, owner:s.owner, status:'live', model, updatedAt:Date.now()};
                }
                catch (_)
                {
                    if (owns(s)) app.state.liveLeaderboard = {...app.state.liveLeaderboard, status:'stale'};
                }
                if (owns(s)) paint(s);
            })().finally(() =>
            {
                s.busy = null;
                if (owns(s)) s.timer = setTimeout(s.run, 5000);
            });
            return s.busy;
        };
        s.wake = () => { if (!document.hidden) s.run(); };
        document.addEventListener('visibilitychange', s.wake);
        if (typeof window !== 'undefined') window.addEventListener('online', s.wake);
        s.run();
    };
    app.logic.refreshLeaderboardLive = () => live?.run() || Promise.resolve();
    app.logic.setLeaderboardMode = function(mode)
    {
        if (!['matrix','list','flights'].includes(mode)) return;
        app.state.leaderboardViewMode = mode; if (live) paint(live);
    };
    app.logic.closeLiveLeaderboardOverlay = function()
    {
        if (live?.target === 'overlay') app.logic.stopLeaderboardLive();
        document.getElementById('score-leaderboard-overlay')?.remove();
    };
    app.logic.showLiveLeaderboardOverlay = function(id)
    {
        app.logic.closeLiveLeaderboardOverlay();
        // Keep the overlay outside the input's render target: an ACK may repaint
        // the score cards without closing or freezing the live scoreboard.
        const wrapper = document.createElement('div'); wrapper.id = 'score-leaderboard-overlay';
        wrapper.className = 'lie-overlay'; wrapper.setAttribute('role','dialog'); wrapper.setAttribute('aria-modal','true');
        wrapper.setAttribute('aria-label','Flight und Live-Stand');
        wrapper.innerHTML = '<div class="lie-overlay-panel"><button id="live-close-overlay" class="lie-button" onclick="app.logic.closeLiveLeaderboardOverlay()">Zur Score-Eingabe</button><div id="overlay-leaderboard-content"></div></div>';
        document.body.appendChild(wrapper); app.logic.startLeaderboardLive(id, 'overlay');
        paint(live); document.getElementById('live-close-overlay')?.focus();
    };
})();
