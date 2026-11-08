import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
await build({entryPoints:['scripts/rich-editor-entry.js','scripts/export-entry.js'],outdir:'assets/js',entryNames:'[name]',bundle:true,minify:true,format:'iife',target:['es2020'],legalComments:'linked'});
await mkdir('assets/licenses',{recursive:true});
const packages=['prosemirror-state','prosemirror-view','prosemirror-model','prosemirror-markdown','prosemirror-commands','prosemirror-schema-list','prosemirror-history','prosemirror-keymap','prosemirror-transform','w3c-keyname','orderedmap','rope-sequence','markdown-it','mdurl','linkify-it','uc.micro','punycode.js','entities','fflate'];
let credits='Locally bundled editor and ZIP dependencies\n\n';for(const name of packages){const pkg=JSON.parse(await readFile('node_modules/'+name+'/package.json','utf8'));credits+='## '+name+' '+pkg.version+'\n';for(const filename of ['LICENSE','LICENSE.md','LICENSE.txt']){try{credits+=await readFile('node_modules/'+name+'/'+filename,'utf8');break;}catch(_){}}credits+='\n\n';}await writeFile('assets/licenses/writer-libraries.txt',credits);
