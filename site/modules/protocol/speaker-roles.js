export const ROLES=Object.freeze(['unknown','doctor','patient','other']);
export function assignRole(draft,sourceId,role){
 if(!ROLES.includes(role)||!draft.sources.some(s=>s.id===sourceId))throw Error('Invalid role assignment');
 return {...draft,sources:draft.sources.map(s=>s.id===sourceId?{...s,role}:s)};
}
export function attachSpeakerHints(rows,turns){
 return rows.map(r=>{const totals=new Map();for(const t of turns??[]){if(!((typeof t.speaker==='string'&&t.speaker.trim())||(Number.isInteger(t.speaker)&&t.speaker>0))||!Number.isFinite(t.startSeconds)||!Number.isFinite(t.endSeconds))continue;const overlap=Math.max(0,Math.min(r.endSeconds,t.endSeconds)-Math.max(r.startSeconds,t.startSeconds));if(overlap>0)totals.set(t.speaker,(totals.get(t.speaker)||0)+overlap);}
 const ranked=[...totals].sort((a,b)=>b[1]-a[1]);const length=r.endSeconds-r.startSeconds,coverage=ranked.reduce((n,x)=>n+x[1],0);const hint=ranked.length&&length>0&&coverage<=length+.025&&ranked[0][1]/length>=.7&&ranked[0][1]/coverage>=.94?ranked[0][0]:null;return {...r,speaker:hint};});
}
