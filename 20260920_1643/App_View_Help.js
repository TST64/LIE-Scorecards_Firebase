// =========================================================================
// BMAssistent / LIE Scorecard - Help & Manual View
// App_View_Help.js
// BSD (Allman) Style
// =========================================================================

var app = app || {};
app.views = app.views || {};

app.views.help = function()
{
    const currentVersion = (typeof CONFIG !== 'undefined' && CONFIG.appVersion) ? CONFIG.appVersion : 'Unbekannt';

    return `
        <div class="max-w-md mx-auto space-y-6 pb-24">
            
            <!-- Header -->
            <div class="space-y-1">
                <h2 class="text-xl font-black text-stone-900 tracking-tight">Handbuch & Hilfe</h2>
                <p class="text-stone-500 text-xs">Alles Wichtige zum BMAssistent und dem LIE-Handicap-System.</p>
            </div>

            <!-- Sektion 1: Das LIE-Handicap System -->
            <div class="bg-white p-5 rounded-2xl border border-stone-200 shadow-3xs space-y-3">
                <div class="flex items-center space-x-2 text-emerald-700">
                    <i class="fas fa-calculator text-sm"></i>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-stone-700">Der LIE-Handicap-Algorithmus</h3>
                </div>
                <p class="text-stone-600 text-xs leading-relaxed">
                    Das LIE-Handicap basiert auf den erzielten Netto-Stableford-Punkten einer gespielten Runde im Verhältnis zu einem festen Soll-Wert (Buffer).
                </p>
                
                <div class="border-t border-stone-100 pt-2 space-y-2">
                    <h4 class="text-[11px] font-bold text-stone-800 uppercase">Das Stableford-Soll:</h4>
                    <ul class="list-disc list-inside text-stone-600 text-xs space-y-1 pl-1">
                        <li><strong>9-Loch-Runde:</strong> Soll = 18 Netto-Punkte</li>
                        <li><strong>18-Loch-Runde:</strong> Soll = 36 Netto-Punkte</li>
                    </ul>
                </div>

                <div class="border-t border-stone-100 pt-2 space-y-2">
                    <h4 class="text-[11px] font-bold text-stone-800 uppercase">Berechnung bei Rundenabschluss:</h4>
                    <div class="space-y-2 text-xs text-stone-600">
                        <div class="p-2 bg-emerald-50 rounded-xl text-emerald-900">
                            <strong>Unterspielung (Gute Runde):</strong><br>
                            Erzielst du mehr Netto-Punkte als das Soll, verbessert sich dein Handicap um <strong>0,5 Schläge pro Punkt</strong> über Soll.<br>
                            <span class="italic text-[10px]">Formel: Neues HCP = Altes HCP - (Netto - Soll) * 0,5</span>
                        </div>
                        <div class="p-2 bg-red-50 rounded-xl text-red-900">
                            <strong>Überspielung (Schlechte Runde):</strong><br>
                            Erzielst du weniger Netto-Punkte als das Soll, verschlechtert sich dein Handicap um <strong>0,1 Schläge pro Punkt</strong> unter Soll (maximal bis HCP 54).<br>
                            <span class="italic text-[10px]">Formel: Neues HCP = Altes HCP + (Soll - Netto) * 0,1</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Sektion 2: User Manual -->
            <div class="bg-white p-5 rounded-2xl border border-stone-200 shadow-3xs space-y-4">
                <div class="flex items-center space-x-2 text-stone-700">
                    <i class="fas fa-book-open text-sm text-amber-500"></i>
                    <h3 class="text-xs font-bold uppercase tracking-wider">Bedienungsanleitung (User Manual)</h3>
                </div>

                <!-- Schritt 1 -->
                <div class="flex items-start space-x-3 text-xs">
                    <div class="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700 flex-shrink-0">1</div>
                    <div class="space-y-0.5">
                        <h4 class="font-bold text-stone-800">Login & PIN</h4>
                        <p class="text-stone-600">Wähle deinen Namen aus und logge dich ein. Deine Anmeldung bleibt lokal auf dem Gerät gespeichert.</p>
                    </div>
                </div>

                <!-- Schritt 2 -->
                <div class="flex items-start space-x-3 text-xs">
                    <div class="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700 flex-shrink-0">2</div>
                    <div class="space-y-0.5">
                        <h4 class="font-bold text-stone-800">Score-Eingabe</h4>
                        <p class="text-stone-600">Während der Runde tippst du die Schläge pro Loch ein. Zusätzliche Werte wie Putts und das "Lady-Bier" (🍻) können direkt erfasst werden. Mit dem Button <strong>"Max Ø"</strong> kannst du ein Loch streichen (Strich).</p>
                    </div>
                </div>

                <!-- Schritt 3 -->
                <div class="flex items-start space-x-3 text-xs">
                    <div class="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700 flex-shrink-0">3</div>
                    <div class="space-y-0.5">
                        <h4 class="font-bold text-stone-800">Sichern & Cloud-Sync</h4>
                        <p class="text-stone-600">Deine Eingaben werden lokal zwischengespeichert. Drücke auf <strong>"Sichern"</strong>, um die Scores direkt in die Firebase-Cloud hochzuladen.</p>
                    </div>
                </div>

                <!-- Schritt 4 -->
                <div class="flex items-start space-x-3 text-xs">
                    <div class="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700 flex-shrink-0">4</div>
                    <div class="space-y-0.5">
                        <h4 class="font-bold text-stone-800">Live-Leaderboard</h4>
                        <p class="text-stone-600">Über das Leaderboard siehst du in Echtzeit die Brutto- und Netto-Platzierungen aller Flights. Über den Button <strong>"Spicken"</strong> kannst du auch direkt aus der Scorekarte die Ergebnisse einsehen.</p>
                    </div>
                </div>
            </div>

            <!-- Footer Note -->
            <p class="text-center text-stone-400 text-[10px] flex items-center justify-center gap-1">
                BMAssistent v${currentVersion} • Entwickelt für die Golf-Männerrunde • Powered by Firebase Firestore 🔥
            </p>
        </div>
    `;
};