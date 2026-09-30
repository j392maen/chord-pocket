import re, base64, io, sys, os
from fontTools import subset
from fontTools.ttLib import TTFont
ORDER=['theory.js','audio.js','native.js','backend.js','oled.js','app.js','menus.js','screen.js','ui.js']
js=''
for f in ORDER:
    p='src/'+f
    if os.path.exists(p): js+=open(p).read()+'\n'
js=js.replace("if (typeof module !== 'undefined') module.exports","if (typeof module !== 'undefined' && module.exports) module.exports")
sh=open('src/shell.html').read()
text=js+sh
chars=set(c for c in text if ord(c)>=32)
for c in range(32,127): chars.add(chr(c))
chars|=set('0123456789０１２３４５６７８９')
def sub(path, name, weight):
    opts=subset.Options(); opts.flavor='woff2'; opts.layout_features=['*']; opts.name_IDs=['*']
    f=TTFont(path); s=subset.Subsetter(opts); s.populate(text=''.join(chars)); s.subset(f)
    b=io.BytesIO(); f.flavor='woff2'; f.save(b); data=b.getvalue()
    return data, "@font-face{font-family:'%s';font-weight:%d;font-style:normal;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2');}" % (name, weight, base64.b64encode(data).decode())
faces=[]; files={}
for path,name,w,fn in [('vendor/PixelMplus10-Regular.ttf','PixelMplus10',400,'pixelmplus10.woff2'),
    ('vendor/ZenKakuGothicNew-Medium.ttf','Zen Kaku Gothic New',500,'zkg-500.woff2'),('vendor/ZenKakuGothicNew-Bold.ttf','Zen Kaku Gothic New',700,'zkg-700.woff2'),('vendor/ZenKakuGothicNew-Black.ttf','Zen Kaku Gothic New',900,'zkg-900.woff2'),
    ('vendor/BarlowSemiCondensed-SemiBold.ttf','Barlow Semi Condensed',600,'bsc-600.woff2'),('vendor/BarlowSemiCondensed-Bold.ttf','Barlow Semi Condensed',700,'bsc-700.woff2'),('vendor/BarlowSemiCondensed-ExtraBold.ttf','Barlow Semi Condensed',800,'bsc-800.woff2')]:
    data,css=sub(path,name,w); faces.append(css); files[fn]=data
out=sh.replace('/*FONTS*/','\n'.join(faces)).replace('/*APP_JS*/',js)
os.makedirs('dist',exist_ok=True)
open('dist/chord-pocket.html','w').write(out)
open('dist/test.html','w').write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"></head><body>'+out+'</body></html>')
# app bundle: index.html standalone (fonts inline as well, simplest & offline)
os.makedirs('ios/ChordPocket/Web',exist_ok=True)
open('ios/ChordPocket/Web/index.html','w').write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"></head><body>'+out+'</body></html>')
print('html', len(out), 'fonts', {k:len(v) for k,v in files.items()}, 'chars', len(chars))
