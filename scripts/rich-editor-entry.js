import {Schema, Fragment} from 'prosemirror-model';
import {EditorState, TextSelection} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {schema as baseSchema, MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer} from 'prosemirror-markdown';
import {baseKeymap, toggleMark, setBlockType, wrapIn, chainCommands, exitCode} from 'prosemirror-commands';
import {wrapInList, splitListItem, liftListItem, sinkListItem} from 'prosemirror-schema-list';
import {history, undo, redo} from 'prosemirror-history';
import {keymap} from 'prosemirror-keymap';
import MarkdownIt from 'markdown-it';

const safeURL = value => /^(https?:\/\/|mailto:|\/(?!\/)|\.\.?\/|#)/i.test(String(value)) && !/[\u0000-\u001f]/.test(value);
let nodes=baseSchema.spec.nodes;
nodes.forEach((name,spec)=>{if(name!=='doc'&&name!=='text'&&!spec.inline)nodes=nodes.update(name,{...spec,attrs:{...spec.attrs,sourceKey:{default:null}}});});
nodes=nodes.addBefore('text','raw_block',{group:'block',atom:true,attrs:{source:{default:''},sourceKey:{default:null}},toDOM:node=>['pre',{class:'rich-raw-block','aria-label':'원문으로 보존한 서식'},node.attrs.source]});
let marks=baseSchema.spec.marks.update('link',{...baseSchema.spec.marks.get('link'),parseDOM:[{tag:'a[href]',getAttrs:el=>safeURL(el.getAttribute('href'))?{href:el.getAttribute('href'),title:el.getAttribute('title')}:false}],toDOM:mark=>['a',{href:safeURL(mark.attrs.href)?mark.attrs.href:'#',rel:'noopener noreferrer'},0]});
const schema=new Schema({nodes,marks});
const tokenizer=MarkdownIt('commonmark',{html:true});
const parser=new MarkdownParser(schema,tokenizer,{...defaultMarkdownParser.tokens,softbreak:{node:'hard_break'}});
const serializer=new MarkdownSerializer({...defaultMarkdownSerializer.nodes,hard_break(state){state.write('\n');},raw_block(state,node){state.write(node.attrs.source);state.closeBlock(node);}},defaultMarkdownSerializer.marks);
let serial=0;
function parseDocument(source){
  const originals=new Map(), liquid=new Map();
  const protectedSource=source.replace(/\((\{\{\s*['"][^'"]+['"]\s*\|\s*relative_url\s*\}\})\)/g,(_,url)=>{const key='/diary-source/'+liquid.size;liquid.set(key,url);return '('+key+')';});
  const originalLines=source.split('\n'),lines=protectedSource.split('\n'),env={};
  const tokens=tokenizer.parse(protectedSource,env),ranges=tokens.filter(t=>t.level===0&&t.map&&t.nesting!==-1).map(t=>t.map);
  // Text nodes must retain their literal text rather than being recreated as empty nodes.
  function restoreNode(node){if(node.isText)return node;return node.type.create(node.type.name==='image'?{...node.attrs,src:liquid.get(node.attrs.src)||node.attrs.src}:node.attrs,Fragment.fromArray(Array.from({length:node.childCount},(_,i)=>restoreNode(node.child(i)))),node.marks);}
  const blocks=[];
  for(let i=0;i<ranges.length;i++){
    const [start,end]=ranges[i],next=ranges[i+1]?.[0]??originalLines.length;
    const core=originalLines.slice(start,end).join('\n'),suffix=(end<next?'\n'+originalLines.slice(end,next).join('\n'):'')+(i<ranges.length-1?'\n':'');
    const key='source-'+(++serial);let node;
    try{const parsed=parser.parse(lines.slice(start,end).join('\n'),env);if(parsed.childCount!==1)throw Error('unsupported');node=restoreNode(parsed.firstChild);}catch(_){node=schema.nodes.raw_block.create({source:core});}
    node=node.type.create({...node.attrs,sourceKey:key},node.content,node.marks);blocks.push(node);originals.set(key,{node,core,suffix});
  }
  const prefix=ranges.length?originalLines.slice(0,ranges[0][0]).join('\n')+(ranges[0][0]?'\n':''):source;
  if(!blocks.length)blocks.push(schema.nodes.paragraph.create());
  return {doc:schema.nodes.doc.create(null,blocks),originals,prefix,source};
}
function serializeDocument(doc,baseline){
  if(doc.eq(baseline.doc))return baseline.source;
  let text=baseline.prefix;
  doc.forEach((node,offset,index)=>{
    const old=baseline.originals.get(node.attrs.sourceKey),unchanged=old&&node.eq(old.node);
    const core=unchanged?old.core:serializer.serialize(schema.nodes.doc.create(null,node));
    text+=core;
    if(index<doc.childCount-1){const suffix=old?.suffix||'\n\n';text+=/^\n{2}/.test(suffix)?suffix:'\n\n'+suffix.replace(/^\n+/, '');}
    else text+=old?.suffix||'';
  });
  return text;
}
let api,view,baseline,lastValue='',sourceMode=false,disabled=false;
const host=document.getElementById('rich-body'),textarea=document.getElementById('post-body');
function updateToolbar(){
  if(!view)return;
  const state=view.state, marks=state.storedMarks||state.selection.$from.marks();
  document.getElementById('editor-undo').disabled=disabled||sourceMode||!undo(state);
  document.getElementById('editor-redo').disabled=disabled||sourceMode||!redo(state);
  document.querySelector('[data-format="bold"]').setAttribute('aria-pressed',String(marks.some(mark=>mark.type===schema.marks.strong)));
  view.dom.classList.toggle('is-empty',state.doc.childCount===1&&state.doc.firstChild.type===schema.nodes.paragraph&&state.doc.firstChild.content.size===0);
}
function sync(){lastValue=serializeDocument(view.state.doc,baseline);textarea.value=lastValue;textarea.dispatchEvent(new Event('input',{bubbles:true}));}
function imageView(node){
  const dom=document.createElement('span'),img=document.createElement('img'),label=document.createElement('span');dom.className='rich-image';dom.contentEditable='false';dom.append(img,label);
  function paint(next){node=next;const url=api.url(node.attrs.src);img.alt=node.attrs.alt||'본문 사진';img.hidden=!url;label.hidden=!!url;label.textContent='사진 불러오는 중';if(url)img.src=url;else img.removeAttribute('src');}
  paint(node);return{dom,update(next){if(next.type!==node.type)return false;paint(next);return true;},refresh(){paint(node);}};
}
const imageViews=new Set();
function init(bridge){
  if(!host)return;api=bridge;baseline=parseDocument(textarea.value);lastValue=textarea.value;
  const enter=chainCommands(splitListItem(schema.nodes.list_item),baseKeymap.Enter);
  view=new EditorView(host,{state:EditorState.create({doc:baseline.doc,plugins:[history(),keymap({'Mod-z':undo,'Mod-Shift-z':redo,'Mod-y':redo,'Mod-b':toggleMark(schema.marks.strong),'Mod-i':toggleMark(schema.marks.em),'Enter':enter,'Shift-Enter':chainCommands(exitCode,(state,dispatch)=>{if(dispatch)dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());return true;}),'Tab':sinkListItem(schema.nodes.list_item),'Shift-Tab':liftListItem(schema.nodes.list_item)}),keymap(baseKeymap)]}),
    attributes:{role:'textbox','aria-label':'본문 편집','aria-multiline':'true','data-placeholder':'완벽한 문장이 아니어도 괜찮아요. 오늘 마음에 남은 것부터 천천히 적어보세요.'},
    editable:()=>!disabled,
    dispatchTransaction(tr){view.updateState(view.state.apply(tr));updateToolbar();if(tr.docChanged)sync();},
    nodeViews:{image(node){const item=imageView(node);imageViews.add(item);return{...item,destroy(){imageViews.delete(item);}};}},
    handlePaste(editor,event){const files=Array.from(event.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));if(!files.length)return false;event.preventDefault();insertImages(files);return true;},
    handleDOMEvents:{drop(editor,event){const files=Array.from(event.dataTransfer?.files||[]).filter(f=>f.type.startsWith('image/'));if(!files.length)return false;event.preventDefault();insertImages(files);return true;},click(editor,event){if(event.target.closest('a')){event.preventDefault();return true;}return false;}}
  });
  textarea.closest('.body-field').hidden=true;host.hidden=false;updateToolbar();
  document.getElementById('editor-source').addEventListener('click',()=>{sourceMode=!sourceMode;host.hidden=sourceMode;textarea.closest('.body-field').hidden=!sourceMode;document.getElementById('editor-source').setAttribute('aria-pressed',String(sourceMode));document.getElementById('editor-source').textContent=sourceMode?'화면 편집으로':'원문 편집';updateToolbar();if(sourceMode)textarea.focus();else{setMarkdown(textarea.value);view.focus();}});
  document.getElementById('editor-undo').addEventListener('click',()=>{undo(view.state,view.dispatch);view.focus();});document.getElementById('editor-redo').addEventListener('click',()=>{redo(view.state,view.dispatch);view.focus();});
  document.getElementById('inline-photo').addEventListener('change',event=>{insertImages(Array.from(event.target.files));event.target.value='';});
  document.getElementById('apply-editor-link').addEventListener('click',()=>{const input=document.getElementById('editor-link-url'),url=input.value.trim();if(!safeURL(url)){input.setCustomValidity('https://로 시작하는 주소를 입력해 주세요.');input.reportValidity();return;}input.setCustomValidity('');const mark=schema.marks.link.create({href:url});const {from,to,empty}=view.state.selection;const tr=view.state.tr;if(empty)tr.insertText(url).addMark(from,from+url.length,mark);else tr.addMark(from,to,mark);view.dispatch(tr);document.getElementById('editor-link-panel').hidden=true;view.focus();});
  document.getElementById('cancel-editor-link').addEventListener('click',()=>{document.getElementById('editor-link-panel').hidden=true;view.focus();});
}
function insertImages(files){if(disabled||!api)return;try{const items=api.stage(files);if(sourceMode){api.insertSource(items.map(item=>'!['+item.alt+']('+item.src+')').join('\n\n'));return;}let tr=view.state.tr;for(const item of items)tr=tr.replaceSelectionWith(schema.nodes.image.create(item));view.dispatch(tr.scrollIntoView());view.focus();}catch(error){api.error(error.message);}}
function setMarkdown(value){if(!view||value===lastValue){for(const item of imageViews)item.refresh();return;}baseline=parseDocument(value);lastValue=value;view.updateState(EditorState.create({doc:baseline.doc,plugins:view.state.plugins}));updateToolbar();let special=false;view.state.doc.forEach(n=>{if(n.type.name==='raw_block')special=true;});document.getElementById('rich-source-notice').hidden=!special;}
function format(kind){if(!view||sourceMode)return false;if(disabled)return true;
 let command;if(kind==='bold')command=toggleMark(schema.marks.strong);if(kind==='heading')command=view.state.selection.$from.parent.type===schema.nodes.heading?setBlockType(schema.nodes.paragraph):setBlockType(schema.nodes.heading,{level:2});if(kind==='quote')command=wrapIn(schema.nodes.blockquote);if(kind==='list')command=wrapInList(schema.nodes.bullet_list);
 if(kind==='link'){document.getElementById('editor-link-panel').hidden=false;document.getElementById('editor-link-url').focus();return true;}
 if(command)command(view.state,view.dispatch);view.focus();return true;
}
window.DiaryRichEditor={init,setMarkdown,format,setBusy(value){disabled=value;view?.setProps({editable:()=>!disabled});updateToolbar();},clear(){if(view)setMarkdown('');},parseDocument,serializeDocument,schema};
