import sys, glob
from PIL import Image
tag=sys.argv[1]; names=sys.argv[2:]
ims=[Image.open(f'shots/{tag}-{n}.png') for n in names]
sc=0.4
ims=[i.resize((int(i.width*sc),int(i.height*sc))) for i in ims]
w=sum(i.width for i in ims)+10*(len(ims)-1); h=max(i.height for i in ims)
o=Image.new('RGB',(w,h),'white'); x=0
for i in ims: o.paste(i,(x,0)); x+=i.width+10
o.save(f'shots/sheet-{tag}-{names[0]}.png'); print(o.size)
