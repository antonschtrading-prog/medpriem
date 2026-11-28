// Conservative candidate policy; browser-specific settings are experimental.
export function webkitLike(ua=''){return /AppleWebKit/i.test(ua)&&(!/Chrome|Chromium|Edg\//i.test(ua)||/iPhone|iPad|iPod/i.test(ua));}
export function diarizationBudget(seconds){if(!Number.isFinite(seconds)||seconds<=0)throw Error('Invalid duration');return Math.min(3600000,Math.max(180000,Math.ceil(seconds*4000+60000)));}
export function candidateStability(ua=''){const webkit=webkitLike(ua);return {webkit,segmentation:webkit?'energy':'silero',maxWindowSeconds:webkit?14:29,gracefulClose:true};}
