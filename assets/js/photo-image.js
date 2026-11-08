(() => {
  'use strict';
  const cache = new WeakMap();
  async function convert(file) {
    if (file.type === 'image/gif') return file;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('지원하지 않는 사진 형식입니다.');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve,reject) => { const image = new Image(); image.onload=()=>resolve(image); image.onerror=()=>reject(new Error('사진을 읽지 못했어요. 다시 선택해 주세요.')); image.src=url; });
      const scale = Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas = document.createElement('canvas'); canvas.width=Math.max(1,Math.round(img.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d'); if (!ctx) throw new Error('사진 크기를 줄일 수 없어요. 다른 브라우저에서 시도해 주세요.');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const type=file.type==='image/jpeg'?'image/jpeg':'image/webp';
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,.82));
      if(!blob) throw new Error('사진을 저장용으로 준비하지 못했어요.');
      if(scale===1 && blob.size>=file.size) return file;
      const ext=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
      return new File([blob],file.name.replace(/\.[^.]+$/,'')+'-web.'+ext,{type:blob.type});
    } finally { URL.revokeObjectURL(url); }
  }
  window.DiaryPhotoImage={prepare(file){if(!cache.has(file))cache.set(file,convert(file).catch(error=>{cache.delete(file);throw error;}));return cache.get(file);}};
})();
