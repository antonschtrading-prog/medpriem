import {enableIsolation} from './isolation.js';
const result=await enableIsolation();if(result.reason!=='reloading')await import('./adaptive-app.js');
