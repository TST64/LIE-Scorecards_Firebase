// Phase 2A is local-only. Production needs its own reviewed profile.
var CONFIG = Object.freeze({appVersion: 'phase2a-local', appName: 'lie-scorecard', gasUrl: null});
var firebaseConfig = Object.freeze({apiKey: 'local-demo-key', authDomain: 'demo-lie-scorecards-local.firebaseapp.com', projectId: 'demo-lie-scorecards-local', storageBucket: 'demo-lie-scorecards-local.appspot.com', appId: 'local-demo-app'});
window.CONFIG = CONFIG;
window.firebaseConfig = firebaseConfig;
