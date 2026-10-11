// =========================================================================
// LIE Scorecard - Persönliche Performance-Statistik
// App_Logic_Performance.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.logic = app.logic || {};

app.logic.isDeletedRound = function(round)
{
    if (!round)
    {
        return true;
    }

    return round.istGeloescht === true ||
        String(round.istGeloescht).toUpperCase() === 'TRUE' ||
        round.istGelöscht === true ||
        String(round.istGelöscht).toUpperCase() === 'TRUE';
};

app.logic.getPerformanceCourseInfo = function(round)
{
    const course = (app.state.kurse || []).find(function(item)
    {
        return String(item.id) === String(round.kursId);
    });

    const place = course
        ? (app.state.golfplaetze || []).find(function(item)
        {
            return String(item.id) === String(course.platzId);
        })
        : null;

    return {
        course: course,
        place: place,
        name: place ? place.name : (course ? course.name : (round.kursId || 'Golfplatz'))
    };
};

app.logic.getPersonalPerformance = function(player)
{
    if (!player)
    {
        return null;
    }

    const playerId = String(player.id);
    const seasonStart = String(app.state.saisonStartDatum || '2026-10-01');
    const rounds = (app.state.spieltage || []).filter(function(round)
    {
        const status = String(round.status || '').toLowerCase().trim();
        const participants = String(round.teilnehmerCsv || '')
            .split(',')
            .map(function(id)
            {
                return id.trim();
            });

        return !app.logic.isDeletedRound(round) &&
            (status === 'beendet' || status === 'abgeschlossen') &&
            String(round.date || round.datum || '') >= seasonStart &&
            participants.includes(playerId);
    }).sort(function(a, b)
    {
        const dateCompare = String(a.date || a.datum || '').localeCompare(String(b.date || b.datum || ''));
        return dateCompare !== 0 ? dateCompare : String(a.id).localeCompare(String(b.id));
    });

    const result = {
        player: player,
        seasonStart: seasonStart,
        rounds: [],
        roundsCount: 0,
        holesCount: 0,
        totalPutts: 0,
        puttHoles: 0,
        onePutts: 0,
        twoPutts: 0,
        threePlusPutts: 0,
        birdies: 0,
        pars: 0,
        bogeys: 0,
        doublePlus: 0,
        striche: 0,
        ladies: 0,
        holeStats: {},
        courses: {},
        hcpSeries: []
    };

    const seasonStartHcp = 26;
    result.hcpSeries.push({
        id: 'season-start',
        date: seasonStart,
        courseId: '',
        courseName: 'Saisonstart',
        holes: 0,
        strokes: 0,
        putts: 0,
        puttHoles: 0,
        netto: 0,
        nettoDelta: 0,
        relativeToPar: 0,
        hcpStart: seasonStartHcp,
        hcpEnd: seasonStartHcp,
        isSeasonStart: true
    });

    rounds.forEach(function(round)
    {
        const holes = app.logic.getRoundHoles ? app.logic.getRoundHoles(round) : [];
        const scores = (app.state.scoreCards || []).filter(function(score)
        {
            return String(score.spieltagId).trim() === String(round.id).trim() &&
                String(score.spielerId).trim() === playerId;
        });

        const requiredHoles = (round.bahnAnzahl === 9 || String(round.rundenTyp || '').startsWith('9'))
            ? 9
            : (parseInt(round.bahnAnzahl) || 18);

        let played = 0;
        let strokesTotal = 0;
        let puttsTotal = 0;
        let puttCount = 0;
        let nettoTotal = 0;
        let relativeToPar = 0;
        const courseInfo = app.logic.getPerformanceCourseInfo(round);

        holes.forEach(function(hole)
        {
            const holeNr = parseInt(hole.nr);
            const score = scores.find(function(item)
            {
                return parseInt(item.hole) === holeNr;
            });

            if (!score)
            {
                return;
            }

            const strokes = parseInt(score.strokes) || 0;
            const par = parseInt(hole.par) || 4;
            const rawPutts = score.puts !== undefined
                ? score.puts
                : (score.putts !== undefined ? score.putts : score.putt);
            const putts = rawPutts === undefined || rawPutts === null || String(rawPutts).trim() === ''
                ? null
                : parseInt(rawPutts);
            const isStrich = strokes === 0 || score.maxscore === true || score.maxscore === 'true' || score.isStrich === true;
            const ladyValue = parseInt(score.ladies) || parseInt(score.lady) || (score.lady === true || score.lady === 'true' ? 1 : 0);

            if (isStrich)
            {
                result.striche++;
            }

            if (ladyValue > 0)
            {
                result.ladies += ladyValue;
            }

            if (strokes > 0)
            {
                played++;
                result.holesCount++;
                strokesTotal += strokes;
                relativeToPar += strokes - par;

                if (!isStrich)
                {
                    if (strokes <= par - 1)
                    {
                        result.birdies++;
                    }
                    else if (strokes === par)
                    {
                        result.pars++;
                    }
                    else if (strokes === par + 1)
                    {
                        result.bogeys++;
                    }
                    else
                    {
                        result.doublePlus++;
                    }
                }

                const historicalHcp = app.logic.getHistoricalHcp
                    ? app.logic.getHistoricalHcp(player, round, score)
                    : player.hcpLIE;
                const strokesGiven = app.logic.calculateHoleVorgabeForHcp
                    ? app.logic.calculateHoleVorgabeForHcp(historicalHcp, round, holeNr)
                    : 0;

                if (app.logic.calculateNettoStableford)
                {
                    nettoTotal += app.logic.calculateNettoStableford(strokes, par, strokesGiven);
                }

                const holeKey = String(round.kursId) + ':' + String(holeNr);
                if (!result.holeStats[holeKey])
                {
                    result.holeStats[holeKey] = {
                        key: holeKey,
                        courseId: String(round.kursId),
                        courseName: courseInfo.name,
                        hole: holeNr,
                        par: par,
                        plays: 0,
                        strokes: 0,
                        putts: 0,
                        puttHoles: 0
                    };
                }

                result.holeStats[holeKey].plays++;
                result.holeStats[holeKey].strokes += strokes;
            }

            if (putts !== null && Number.isFinite(putts) && putts >= 0)
            {
                result.totalPutts += putts;
                result.puttHoles++;
                puttsTotal += putts;
                puttCount++;

                if (putts === 1)
                {
                    result.onePutts++;
                }
                else if (putts === 2)
                {
                    result.twoPutts++;
                }
                else if (putts >= 3)
                {
                    result.threePlusPutts++;
                }

                const holeKey = String(round.kursId) + ':' + String(holeNr);
                if (result.holeStats[holeKey])
                {
                    result.holeStats[holeKey].putts += putts;
                    result.holeStats[holeKey].puttHoles++;
                }
            }
        });

        if (played < requiredHoles)
        {
            return;
        }

        const startHcp = round.hcpStart && Number.isFinite(parseFloat(round.hcpStart[playerId]))
            ? parseFloat(round.hcpStart[playerId])
            : null;
        const endHcp = round.hcpEnd && Number.isFinite(parseFloat(round.hcpEnd[playerId]))
            ? parseFloat(round.hcpEnd[playerId])
            : startHcp;
        const stablefordTarget = requiredHoles === 9 ? 18 : 36;
        const date = String(round.date || round.datum || '');

        const roundResult = {
            id: round.id,
            date: date,
            courseId: String(round.kursId),
            courseName: courseInfo.name,
            holes: requiredHoles,
            strokes: strokesTotal,
            putts: puttsTotal,
            puttHoles: puttCount,
            netto: nettoTotal,
            nettoDelta: nettoTotal - stablefordTarget,
            relativeToPar: relativeToPar,
            hcpStart: startHcp,
            hcpEnd: endHcp
        };

        result.rounds.push(roundResult);
        result.hcpSeries.push(roundResult);

        if (!result.courses[roundResult.courseId])
        {
            result.courses[roundResult.courseId] = {
                id: roundResult.courseId,
                name: roundResult.courseName,
                rounds: 0,
                putts: 0,
                puttHoles: 0,
                relativeToPar: 0,
                holes: 0
            };
        }

        result.courses[roundResult.courseId].rounds++;
        result.courses[roundResult.courseId].putts += puttsTotal;
        result.courses[roundResult.courseId].puttHoles += puttCount;
        result.courses[roundResult.courseId].relativeToPar += relativeToPar;
        result.courses[roundResult.courseId].holes += played;
    });

    result.roundsCount = result.rounds.length;
    result.avgPutts = result.puttHoles > 0 ? result.totalPutts / result.puttHoles : null;
    result.startHcp = seasonStartHcp;
    result.currentHcp = result.hcpSeries.length > 0 ? result.hcpSeries[result.hcpSeries.length - 1].hcpEnd : parseFloat(player.hcpLIE);
    result.hcpChange = Number.isFinite(result.startHcp) && Number.isFinite(result.currentHcp)
        ? result.currentHcp - result.startHcp
        : null;
    result.bestRound = result.rounds.length > 0
        ? result.rounds.slice().sort(function(a, b)
        {
            return b.nettoDelta - a.nettoDelta;
        })[0]
        : null;

    const holeStats = Object.values(result.holeStats).filter(function(item)
    {
        return item.plays > 0;
    }).map(function(item)
    {
        item.avgRelativeToPar = (item.strokes / item.plays) - item.par;
        item.avgPutts = item.puttHoles > 0 ? item.putts / item.puttHoles : null;
        return item;
    });

    result.holeStatsList = holeStats;
    result.bestHole = holeStats.length > 0
        ? holeStats.slice().sort(function(a, b)
        {
            return a.avgRelativeToPar - b.avgRelativeToPar;
        })[0]
        : null;
    result.worstHole = holeStats.length > 0
        ? holeStats.slice().sort(function(a, b)
        {
            return b.avgRelativeToPar - a.avgRelativeToPar;
        })[0]
        : null;

    result.bestPuttingRound = result.rounds.filter(function(item)
    {
        return item.puttHoles > 0;
    }).sort(function(a, b)
    {
        return (a.putts / a.puttHoles) - (b.putts / b.puttHoles);
    })[0] || null;

    return result;
};
