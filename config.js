// config.js

var isWindowAvailable = (typeof window !== 'undefined');

var configData = {
    appVersion: '5.0.0.4',
    appName: 'lie-scorecard',
    gasUrl: 'https://script.google.com/macros/s/AKfycbyxrATlHf3bcAD4vHjTKVIdwDXdyUXBtr_2L0asZXDDEyw9wDEfF2HDdouMc2dEiFBEOQ/exec'
};

var firebaseData = {
    apiKey: "AIzaSyBH6Rb8RLKw6tUrOM-j8Qcfnqlkte3crCM",
    authDomain: "liescorecard-70c5e.firebaseapp.com",
    projectId: "liescorecard-70c5e",
    storageBucket: "liescorecard-70c5e.firebasestorage.app",
    messagingSenderId: "163868016379",
    appId: "1:163868016379:web:0b7f1aeb29d80f9ca37a5e"
};

if (isWindowAvailable)
{
    window.CONFIG = configData;
    window.firebaseConfig = firebaseData;
}
else if (typeof self !== 'undefined')
{
    self.CONFIG = configData;
    self.firebaseConfig = firebaseData;
}