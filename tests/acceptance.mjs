import {runSuite} from '../dist/lib/acceptance.js';
import {writeFile,mkdir} from 'node:fs/promises';
const r=runSuite();await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/acceptance-results.json',JSON.stringify(r,null,2));
await writeFile('dist/acceptance-results.json',JSON.stringify(r,null,2));
console.log(JSON.stringify(r,null,2));if(r.failed)process.exitCode=1;
