// Label-invariant binary-speaker time metrics, nonoverlapping annotations only.
// Durations measured by exact interval boundaries, no collar. Not standard DER for overlap.
function validate(turns,duration){let last=0;for(const t of turns){if(typeof t.speaker!=='string'||!Number.isFinite(t.startSeconds)||!Number.isFinite(t.endSeconds)||t.startSeconds<last||t.endSeconds<=t.startSeconds||t.endSeconds>duration)throw Error('Invalid or overlapping turns');last=t.endSeconds;}}
export function scoreSpeakers(reference,predicted,duration){if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid duration');validate(reference,duration);validate(predicted,duration);
 const a=[...new Set(reference.map(t=>t.speaker))],b=[...new Set(predicted.map(t=>t.speaker))];if(a.length>2||b.length>2)throw Error('Binary speakers only');
 const bounds=[...new Set([0,duration,...[...reference,...predicted].flatMap(t=>[t.startSeconds,t.endSeconds])])].sort((x,y)=>x-y);
 let speech=0,miss=0,falseAlarm=0,conf=[0,0];for(let i=1;i<bounds.length;i++){const lo=bounds[i-1],hi=bounds[i],m=(lo+hi)/2,dt=hi-lo,r=reference.find(t=>t.startSeconds<=m&&m<t.endSeconds),p=predicted.find(t=>t.startSeconds<=m&&m<t.endSeconds);if(r)speech+=dt;if(r&&!p)miss+=dt;if(!r&&p)falseAlarm+=dt;if(r&&p){const x=a.indexOf(r.speaker),y=b.indexOf(p.speaker);conf[0]+=x===y?0:dt;conf[1]+=x===1-y?0:dt;}}
 const confusion=Math.min(...conf);return {referenceSpeechSeconds:speech,missSeconds:miss,falseAlarmSeconds:falseAlarm,confusionSeconds:confusion,errorRate:speech?(miss+falseAlarm+confusion)/speech:null};}
