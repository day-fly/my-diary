(() => {
  'use strict';
  function images(body){return [...body.matchAll(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g)].map(m=>({raw:m[0],alt:m[1],url:m[2],index:m.index}));}
  function rewrite(body,items,replacements){let result=body;for(let i=items.length-1;i>=0;i--)result=result.slice(0,items[i].index)+(replacements[i]||'')+result.slice(items[i].index+items[i].raw.length);return result;}
  function render(api){
    const box=document.getElementById('photo-editor');if(!box)return;
    box.replaceChildren();const bodyImages=images(api.body);
    const groups=[{name:'본문 속 사진',key:'body',items:bodyImages},{name:'추가한 사진',key:'gallery',items:api.gallery.map(url=>({url,alt:'본문 사진'}))}];
    box.hidden=!groups.some(group=>group.items.length);
    for(const group of groups){
      if(!group.items.length)continue;
      const section=document.createElement('section'),heading=document.createElement('h3'),list=document.createElement('div');heading.textContent=group.name;list.className='photo-edit-list';section.append(heading,list);box.append(section);
      function change(values){if(group.key==='body')api.change(rewrite(api.body,bodyImages,values.map(item=>item.raw)),api.gallery);else api.change(api.body,values.map(item=>item.url));}
      function move(from,to){if(to<0||to>=group.items.length||from===to)return;const copy=group.items.slice(),[item]=copy.splice(from,1);copy.splice(to,0,item);change(copy);}
      group.items.forEach((item,index)=>{
        const row=document.createElement('div');row.className='photo-edit-item';row.draggable=!api.busy;
        row.addEventListener('dragstart',event=>event.dataTransfer.setData('text/plain',group.key+':'+index));
        row.addEventListener('dragover',event=>event.preventDefault());
        row.addEventListener('drop',event=>{event.preventDefault();if(api.busy)return;const [kind,from]=event.dataTransfer.getData('text/plain').split(':');if(kind===group.key&&/^\d+$/.test(from)&&Number(from)<group.items.length)move(Number(from),index);});
        const img=document.createElement('img');img.alt=(index+1)+'번째 사진';const source=api.url(item.url);if(source)img.src=source;
        const actions=document.createElement('div');actions.className='photo-edit-actions';
        function button(label,action,disabled=false){const b=document.createElement('button');b.type='button';b.className='btn-light';b.textContent=label;b.disabled=api.busy||disabled;b.setAttribute('aria-label',group.name+' '+(index+1)+' · '+label);b.addEventListener('click',action);actions.append(b);}
        button('앞으로',()=>move(index,index-1),index===0);button('뒤로',()=>move(index,index+1),index===group.items.length-1);
        const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp,image/gif';file.hidden=true;
        button('교체',()=>file.click());file.addEventListener('change',()=>{if(!file.files[0]||api.busy)return;try{const url=api.stage(file.files[0]);const copy=group.items.slice();copy[index]={...item,url,raw:'!['+item.alt+']('+url+')'};change(copy);}catch(error){api.error(error.message);}});
        button('빼기',()=>{if(group.key==='body'){const copy=group.items.map(item=>item.raw);copy[index]='';api.change(rewrite(api.body,bodyImages,copy),api.gallery);}else change(group.items.filter((_,i)=>i!==index));});
        row.append(img,actions,file);list.append(row);
      });
    }
  }
  window.DiaryPhotoEditor={render,images,rewrite};
})();
