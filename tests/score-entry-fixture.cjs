'use strict';
function scoreEntryFixtureData(type = '18')
{
    const holes = Array.from({ length: type === '18' ? 18 : 9 }, function(_, i)
    {
        return i + (type === '9-Back' ? 10 : 1);
    });
    return { ownerUid: 'A', playerId: 'A', spieltagId: 'ST', flightId: 'FL-ST-1', flightSeq: 1,
        members: ['A', 'B', 'C', 'D'], players: [
            { id: 'A', nickname: 'Anna', hcpLIE: 18 },
            { id: 'B', nickname: 'Ben', hcpLIE: 18 },
            { id: 'C', nickname: 'Chris', hcpLIE: 18 },
            { id: 'D', nickname: 'Dora', hcpLIE: 18 }],
        course: { name: 'Testkurs' }, handicaps: [],
        round: { hcpStart:{A:18,B:18,C:18,D:18}, kursId: 'K', status: 'Aktiv', rundenTyp: type, bahnAnzahl: holes.length, holes: holes,
            holeData: holes.map(function(nr)
            {
                return { nr: nr, par: 4, si: nr };
            }) },
        cards: ['A', 'B', 'C', 'D'].flatMap(function(id)
        {
            return holes.map(function(hole)
            {
                return { documentId: 'SC-ST-' + id + '-' + hole, spielerId: id, hole: hole, exists: false,
                    values: {}, metadata: {}, generation: 'absent',
                    fieldRevisions: { strokes: 0, puts: 0, lady: 0, maxscore: 0 } };
            });
        }) };
}
if (typeof module !== 'undefined')
{
    module.exports = { scoreEntryFixtureData: scoreEntryFixtureData };
}
