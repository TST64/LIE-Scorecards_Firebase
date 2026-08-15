/* ==========================================
   VIEWS: SPIELTAGE
   ========================================== */

   app.views.spieltage = function()
   {
       const currentUser = app.state.currentUser;
       const isLeiter = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Spielleiter');
   
       // Filter out deleted ("istGeloescht"), canceled ("Abgebrochen"), and empty ghost rounds
       const activeRounds = app.state.spieltage ? app.state.spieltage.filter(function(st) 
       {
           if (!st || !st.id || String(st.id).trim() === "") 
           {
               return false;
           }
   
           const isDel = st.istGeloescht === true || 
                         String(st.istGeloescht).toUpperCase() === "TRUE" || 
                         st.istGelöscht === true || 
                         String(st.istGelöscht).toUpperCase() === "TRUE";
   
           return st.status !== 'Abgebrochen' && !isDel;
       }) : [];
   
       // Sort by date (newest first)
       activeRounds.sort(function(a, b) 
       {
           return new Date(b.date) - new Date(a.date);
       });
   
       let html = `
           <div class="space-y-6 max-w-4xl mx-auto pb-12">
               <!-- Header Section -->
               <div class="border-b border-stone-200 pb-4">
                   <h1 class="text-2xl sm:text-3xl font-bold text-stone-800 tracking-tight">Spieltage</h1>
                   <p class="text-xs sm:text-sm text-stone-500 mt-1">Übersicht aller aktiven und vergangenen Runden</p>
               </div>
   
               <!-- Liste der Spieltage -->
               <div class="space-y-4">
       `;
   
       if (activeRounds.length === 0)
       {
           html += `
               <div class="bg-stone-50 border border-dashed border-stone-300 rounded-xl p-8 text-center">
                   <i class="fas fa-calendar-times text-stone-400 text-3xl mb-3"></i>
                   <p class="text-stone-600 font-medium text-sm">Keine Spieltage vorhanden</p>
                   <p class="text-stone-400 text-xs mt-1">Es wurden noch keine Runden angelegt oder alle bisherigen wurden gelöscht.</p>
               </div>
           `;
       }
       else
       {
           activeRounds.forEach(function(st)
           {
               const isLaufend = st.status === 'Aktiv';
   
               // Status Badge Formatting
               let statusBadge = '';
               if (isLaufend)
               {
                   statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200 flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>Laufend</span>`;
               }
               else if (st.status === 'Beendet')
               {
                   statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold bg-stone-100 text-stone-600 rounded-full border border-stone-200">Beendet</span>`;
               }
               else
               {
                   statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full border border-amber-200">Geplant</span>`;
               }
   
               // Kursname auflösen
               const kurs = app.state.kurse ? app.state.kurse.find(function(k) { return k.id === st.kursId; }) : null;
               const kursName = kurs ? kurs.name : (st.kursId || "Unbekannter Kurs");
   
               // Formatiertes Datum
               let datumFormatted = st.date;
               try
               {
                   const d = new Date(st.date);
                   if (!isNaN(d.getTime()))
                   {
                       datumFormatted = d.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
                   }
               }
               catch (e)
               {
                   // Fallback auf Rohwert
               }
   
               // Teilnehmeranzahl ermitteln
               const teilnehmerAnzahl = st.teilnehmerCsv ? st.teilnehmerCsv.split(',').filter(Boolean).length : 0;
   
               // SHORTCUT-BUTTON ZUR SCORE-EINGABE (nur bei laufenden Runden)
               let scoreShortcutBtnHtml = '';
               if (isLaufend)
               {
                   // Flight des aktuellen Spielers ermitteln
                   let myFlightSeq = 1;
                   if (currentUser && app.state.flights)
                   {
                       const myFlight = app.state.flights.find(function(f)
                       {
                           if (String(f.spieltagId).trim() !== String(st.id).trim()) return false;
                           const ids = (f.spielerIdsCsv || "").split(',');
                           return ids.includes(String(currentUser.id).trim());
                       });
   
                       if (myFlight && myFlight.id)
                       {
                           const parts = myFlight.id.split('-');
                           myFlightSeq = parseInt(parts[parts.length - 1]) || 1;
                       }
                   }
   
                   scoreShortcutBtnHtml = `
                       <button onclick="event.stopPropagation(); app.router.navigate('score_eingabe', { id: '${st.id}', hole: 1, flightSeq: ${myFlightSeq} })" 
                               class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 touch-target">
                           <i class="fas fa-pen-to-square"></i>
                           <span>Score eingeben</span>
                       </button>
                   `;
               }
   
               // Admin Lösch-Button
               let deleteBtnHtml = '';
               if (isLeiter)
               {
                   deleteBtnHtml = `
                       <button onclick="event.stopPropagation(); app.logic.softDeleteSpieltag('${st.id}')" 
                               class="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition touch-target" 
                               title="Spieltag löschen">
                           <i class="fas fa-trash-alt text-sm"></i>
                       </button>
                   `;
               }
   
               html += `
                   <div onclick="app.router.navigate('leaderboard', { id: '${st.id}', mode: 'netto' })" 
                        class="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                       
                       <div class="space-y-2">
                           <div class="flex items-center gap-3">
                               ${statusBadge}
                               <span class="text-xs font-medium text-stone-400"><i class="far fa-calendar-alt mr-1"></i>${datumFormatted}</span>
                           </div>
                           
                           <div>
                               <h3 class="text-lg font-bold text-stone-800">${kursName}</h3>
                               <p class="text-xs text-stone-500 mt-0.5">ID: <span class="font-mono text-stone-400">${st.id}</span></p>
                           </div>
   
                           <div class="flex items-center gap-4 text-xs text-stone-600 pt-1">
                               <span class="flex items-center gap-1">
                                   <i class="fas fa-users text-stone-400"></i> ${teilnehmerAnzahl} Teilnehmer
                               </span>
               `;
   
               if (st.bruttoSieger)
               {
                   html += `
                               <span class="flex items-center gap-1 text-amber-700">
                                   <i class="fas fa-trophy"></i> Brutto: ${st.bruttoSieger}
                               </span>
                   `;
               }
   
               html += `
                           </div>
                       </div>
   
                       <div class="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-stone-100 pt-3 sm:pt-0">
                           <div class="flex items-center gap-2">
                               ${scoreShortcutBtnHtml}
                               ${deleteBtnHtml}
                               <div class="w-8 h-8 rounded-full bg-stone-50 text-stone-400 flex items-center justify-center hidden sm:flex" title="Leaderboard / Details">
                                   <i class="fas fa-chevron-right text-xs"></i>
                               </div>
                           </div>
                       </div>
   
                   </div>
               `;
           });
       }
   
       html += `
               </div>
           </div>
       `;
   
       return html;
   };