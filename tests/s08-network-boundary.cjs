'use strict';
// requestWillBeSent describes an attempted request, not proof of transmission.
// Do not widen the network allowlist. Recognize only the SDK's exact image
// when Chrome independently proves enforced CSP rejection with no response.
function classify(events){
    const unexpected=new Set();let blockedConnectivityImages=0;
    for(const request of events.filter(e=>e.event==='Network.requestWillBeSent')){
        const known=request.url==='https://www.google.com/images/cleardot.gif'&&request.type==='Image'&&request.method==='GET';
        const enforced=events.some(e=>e.event==='Audits.issueAdded'&&e.url===request.url&&e.directive==='img-src'&&e.reportOnly===false);
        const blocked=events.some(e=>e.event==='Network.loadingFailed'&&e.id===request.id&&e.blockedReason==='csp');
        const response=events.some(e=>e.id===request.id&&(e.event==='Network.responseReceived'||e.redirectResponse===true));
        if(known&&enforced&&blocked&&!response)blockedConnectivityImages++;else unexpected.add(new URL(request.url).origin);
    }
    return {unexpectedOrigins:[...unexpected],blockedConnectivityImages};
}
module.exports={classify};
