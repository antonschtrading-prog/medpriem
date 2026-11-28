import fs from 'node:fs/promises';
import path from 'node:path';
const target=process.argv[2]||'publish';
await fs.mkdir(target,{recursive:true});
for(const p of ['preview-v12','preview-v11','modules/quality','modules/protocol']){
 const dest=path.join(target,p);
 await fs.mkdir(path.dirname(dest),{recursive:true});
 await fs.cp('site/'+p,dest,{recursive:true,filter:src=>!src.endsWith('.md')&&!src.endsWith('punctuation-lab.html')});
}
await fs.writeFile(path.join(target,'index.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./preview-v12/"><title>МедПриём</title><a href="./preview-v12/">МедПриём 1.2.1</a> · <a href="./preview-v11/">Предыдущая версия 1.1.1</a></html>\n');
