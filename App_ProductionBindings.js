// Configuration injection only. V2 storage/sender/controller sources unchanged.
(function()
{
    LieEnvironment.validate(window.LIE_PRODUCTION_PROFILE, window.firebaseConfig, window.location, firebase.apps);
    const key = 'production:liescorecard-70c5e';
    const storage = app.createScoreSyncStore, contexts = app.createScoreEntryContextStore;
    app.createScoreSyncStore = function(name)
    {
        const expected = 'lie_score_sync_v2__' + key;
        if (name !== undefined && name !== expected) throw new Error('Foreign Produktion score storage.');
        return storage(expected);
    };
    app.createScoreEntryContextStore = function(name)
    {
        const expected = 'lie_score_entry_context_v2__' + key;
        if (name !== undefined && name !== expected) throw new Error('Foreign Produktion context storage.');
        return contexts(expected);
    };
    // The original store object is lazy and has not been opened during loading.
    // No migration, clear, deleteDatabase or pending-data discard is performed.
    app.scoreSyncStore = app.createScoreSyncStore();
    app.logic.v1Environment = key;
    app.logic.scoreSyncStorageKey = 'lie_score_sync_v1_s01__' + key;
    app.logic.saveV1ScoreSnapshot = async function() { throw new Error('Legacy score writes disabled in Produktion.'); };
    app.logic.openPixelGolfGame = function() { app.logic.showToast('Externe Spiele sind im Feldtest ausgeschaltet.','warning'); };
})();
