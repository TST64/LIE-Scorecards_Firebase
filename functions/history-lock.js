'use strict';
async function historyState(tx,db){const s=await tx.get(db.collection('historyPublication').doc('current')),state={revision:0,activeRun:null,...(s.exists?s.data():{})};if(!Number.isSafeInteger(state.revision)||state.revision<0||(state.activeRun!==null&&(typeof state.activeRun!=='string'||!state.activeRun)))throw new Error('Invalid publication barrier');return state;}
async function requireHistoryIdle(tx,db){const state=await historyState(tx,db);if(state.activeRun)throw new Error('History correction barrier active');return state;}
module.exports={historyState,requireHistoryIdle};
