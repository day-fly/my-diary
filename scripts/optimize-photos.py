"""Create display copies; preserve original URLs and metadata-free output."""
from pathlib import Path
from PIL import Image, ImageOps
import hashlib,json
root=Path(__file__).resolve().parents[1]
result={}
(root/'assets/photos/optimized').mkdir(parents=True,exist_ok=True)
for source in sorted((root/'assets/photos').glob('*')):
 if not source.is_file() or source.suffix.lower() not in ('.jpg','.jpeg','.png','.webp'):continue
 with Image.open(source) as original:
  # JPEG/MPO extra frames can be HDR gain maps, not animation.
  if source.suffix.lower() not in ('.jpg','.jpeg') and getattr(original,'is_animated',False):continue
  original.seek(0)
  image=ImageOps.exif_transpose(original)
  alpha=image.mode in ('RGBA','LA') or 'transparency' in image.info
  image=image.convert('RGBA' if alpha else 'RGB')
  digest=hashlib.sha256(source.read_bytes()).hexdigest()[:16]
  entry={}
  for name,edge in [('display',1600),('small',640)]:
   copy=image.copy();copy.thumbnail((edge,edge),Image.Resampling.LANCZOS)
   ext='webp' if alpha else 'jpg';dest=root/f'assets/photos/optimized/{digest}-{edge}.{ext}'
   if not dest.exists():copy.save(dest,quality=82,optimize=True,**({'progressive':True} if ext=='jpg' else {}))
   entry[name]='/'+str(dest.relative_to(root));entry[name+'_width'],entry[name+'_height']=copy.size
  result['/'+str(source.relative_to(root))]=entry
(root/'_data/photos.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('Optimized',len(result),'photos;',sum(p.stat().st_size for p in (root/'assets/photos/optimized').iterdir()),'bytes of display copies')
