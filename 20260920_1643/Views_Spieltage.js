/* ==========================================
   VIEWS: SPIELTAGE (Mit 'Meine Runden' Filter)
   ========================================== */

   app.views.spieltage = function(filterParam)
   {
       const currentUser = app.state.currentUser;
       const isLeiter = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Spielleiter');
   
       // Filter-Modus ermitteln ('all' oder 'my')
       let activeFilter = filterParam || app.state.spieltageFilterMode || 'all';
       app.state.spieltageFilterMode = activeFilter;
   
       // 1. Alle aktiven (nicht gelöschten/abgebrochenen) Runden filtern
       const activeRounds = app.state.spieltage ? app.state.spieltage.filter(function(st) 
       {
           if (!st || !st.id || String(st.id).trim() === "") return false;
   
           const isDel = st.istGeloescht === true || 
                         String(st.istGeloescht).toUpperCase() === "TRUE" || 
                         st.istGelöscht === true || 
                         String(st.istGelöscht).toUpperCase() === "TRUE";
   
           return st.status !== 'Abgebrochen' && !isDel;
       }) : [];
   
       // Chronologisch sortieren (Neueste zuerst)
       activeRounds.sort((a, b) => new Date(b.date) - new Date(a.date));
   
       // 2. Anzahl der eigenen Runden für den Button-Badge berechnen
       const myRoundsCount = activeRounds.filter(st => {
           if (!currentUser) return false;
           const ids = (st.teilnehmerCsv || "").split(',').map(id => id.trim());
           return ids.includes(String(currentUser.id).trim());
       }).length;
   
       // 3. Runden basierend auf gewähltem Filter filtern
       let roundsToDisplay = activeRounds;
       if (activeFilter === 'my' && currentUser)
       {
           roundsToDisplay = activeRounds.filter(st => {
               const ids = (st.teilnehmerCsv || "").split(',').map(id => id.trim());
               return ids.includes(String(currentUser.id).trim());
           });
       }
   
       let html = `
           <div class="space-y-5 max-w-4xl mx-auto pb-12">
               <!-- Header Section -->
               <div class="border-b border-stone-200 pb-3 flex justify-between items-end">
                   <div>
                       <h1 class="text-2xl sm:text-3xl font-bold text-stone-800 tracking-tight">Spieltage</h1>
                       <p class="text-xs sm:text-sm text-stone-500 mt-0.5">Übersicht aller aktiven und vergangenen Runden</p>
                   </div>
               </div>
   
               <!-- Filter-Schalter (Alle Runden vs. Meine Runden) -->
               <div class="grid grid-cols-2 p-1 bg-zinc-100 rounded-xl border border-zinc-200 max-w-xs">
                   <button onclick="app.router.navigate('spieltage', 'all')" 
                           class="py-1.5 text-xs font-bold rounded-lg transition-all ${activeFilter !== 'my' ? 'bg-white text-emerald-800 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'}">
                       <i class="fas fa-globe mr-1"></i> Alle Runden (${activeRounds.length})
                   </button>
                   <button onclick="app.router.navigate('spieltage', 'my')" 
                           class="py-1.5 text-xs font-bold rounded-lg transition-all ${activeFilter === 'my' ? 'bg-white text-emerald-800 shadow-xs' : 'text-zinc-500 hover:text-zinc-800'}">
                       <i class="fas fa-user-check mr-1"></i> Meine Runden (${myRoundsCount})
                   </button>
               </div>
   
               <!-- Liste der Spieltage -->
               <div class="space-y-4">
       `;
   
       if (roundsToDisplay.length === 0)
       {
           const emptyMsg = activeFilter === 'my' 
               ? "Du hast bisher an keinen gespielten Runden teilgenommen." 
               : "Es wurden noch keine Runden angelegt oder alle wurden gelöscht.";
   
           html += `
               <div class="bg-stone-50 border border-dashed border-stone-300 rounded-xl p-8 text-center">
                   <i class="fas fa-calendar-times text-stone-400 text-3xl mb-3"></i>
                   <p class="text-stone-600 font-medium text-sm">Keine Spieltage gefunden</p>
                   <p class="text-stone-400 text-xs mt-1">${emptyMsg}</p>
               </div>
           `;
       }
       else
       {
           roundsToDisplay.forEach(function(st)
           {
               const isLaufend = st.status === 'Aktiv';
   
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
   
               const kurs = app.state.kurse ? app.state.kurse.find(k => k.id === st.kursId) : null;
               const kursName = kurs ? kurs.name : (st.kursId || "Unbekannter Kurs");
   
               let datumFormatted = st.date;
               try
               {
                   const d = new Date(st.date);
                   if (!isNaN(d.getTime()))
                   {
                       datumFormatted = d.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
                   }
               } catch (e) {}
   
               const teilnehmerAnzahl = st.teilnehmerCsv ? st.teilnehmerCsv.split(',').filter(Boolean).length : 0;
   
               let scoreShortcutBtnHtml = '';
               if (isLaufend)
               {
                   let myFlightSeq = 1;
                   if (currentUser && app.state.flights)
                   {
                       const myFlight = app.state.flights.find(f => {
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