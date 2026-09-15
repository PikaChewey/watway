import json,math,os,xml.etree.ElementTree as ET
LAT,LON=43.47165,-80.5437
project=lambda lat,lon:[round((lon-LON)*111320*math.cos(math.radians(LAT)),2),round(-(lat-LAT)*111320,2)]
if os.path.exists('work/osm-raw.json'):
 raw=json.load(open('work/osm-raw.json'))['elements']
elif os.path.exists('work/osm-coffee.json') and os.path.getsize('work/osm-coffee.json')>1000:
 raw=json.load(open('work/osm-coffee.json'))['elements']
else:
 file='work/osm.xml' if os.path.exists('work/osm.xml') and os.path.getsize('work/osm.xml')>1000 else 'work/osm-small.xml'
 tree=ET.parse(file).getroot();nodes={x.attrib['id']:{'lat':float(x.attrib['lat']),'lon':float(x.attrib['lon'])} for x in tree.findall('node')}
 raw=[]
 for w in tree.findall('way'):
  refs=[x.attrib['ref'] for x in w.findall('nd')]
  if all(r in nodes for r in refs):raw.append({'id':int(w.attrib['id']),'type':'way','nodes':[int(r) for r in refs],'geometry':[nodes[r] for r in refs],'tags':{x.attrib['k']:x.attrib['v'] for x in w.findall('tag')}})
 for n in tree.findall('node'):
  tags={x.attrib['k']:x.attrib['v'] for x in n.findall('tag')}
  if tags:raw.append({'id':int(n.attrib['id']),'type':'node',**nodes[n.attrib['id']],'tags':tags})
 json.dump({'elements':raw},open('work/osm-raw.json','w'))
features=[]
for f in raw:
 t=f.get('tags',{});geom=f.get('geometry',[])
 if len(geom)<2:continue
 typ='building' if 'building' in t else 'water' if t.get('natural')=='water' or 'waterway' in t else 'wood' if t.get('natural') in ['wood','scrub'] or t.get('landuse')=='forest' else 'park' if t.get('leisure') in ['park','pitch','garden'] or t.get('landuse') in ['grass','meadow'] else 'parking' if t.get('amenity')=='parking' else 'path' if t.get('highway') in ['footway','path','pedestrian','steps','cycleway'] else 'road' if 'highway' in t else None
 if not typ:continue
 points=[project(g['lat'],g['lon']) for g in geom]
 height=float(t.get('height','0').replace(' m','')) if t.get('height','0').replace(' m','').replace('.','',1).isdigit() else 0
 if not height:height=float(t.get('building:levels','3'))*3.8 if t.get('building:levels','3').isdigit() else 11.4
 features.append({'id':str(f['id']),'points':points,'type':typ,'name':t.get('name',''),'height':height,'width':3 if typ=='path' else 8 if t.get('highway')=='service' else 13,'surface':t.get('surface',''),'stairs':t.get('highway')=='steps','access':t.get('access',''),'nodes':f.get('nodes',[]),'tags':t})
uw=json.load(open('work/uw-buildings.json'))
keep='CPH PAS DWE E2 E3 PHY ML ESC B1 LIB AL EV1 RCH CSB B2 GSC COM SCH MC PAC SLC V1C HS HH NH BMH OPT EV2 FED ECH DC EIT CIF MKV TC ERC QNC E5 STC M3 EV3 E6 PSE CMH GH LHI STJ REN UTD CGR EXP EC1 EC2 EC3 EC4 EC5'.split()
floors={'MC':6,'DC':3,'LIB':10,'QNC':6,'E5':6,'E6':6,'PSE':7,'M3':4,'SLC':3,'STC':6,'EIT':5,'NH':3,'PAS':4,'HH':3,'EV3':4,'TC':3,'OPT':3,'RCH':3,'PAC':2,'CIF':2}
short={'LIB':'Dana Porter Library','DC':'Davis Centre','MC':'Mathematics & Computer','QNC':'Quantum-Nano Centre','PSE':'Pearl Sullivan Engineering','SLC':'Student Life Centre','EIT':'Environment & IT','RCH':'R.C.H. Lecture Hall','NH':'Needles Hall','DWE':'Douglas Wright Engineering','BMH':'B.C. Matthews Hall','LHI':'Lyle Hallman Institute','V1C':'Village 1','STJ':"St. Jerome’s University",'REN':'Renison University College','CGR':'Conrad Grebel','HH':'Hagey Hall','TC':'Tatham Centre','EXP':'Health Expansion'}
desc={'MC':'The heart of Waterloo mathematics. Lecture halls, computing labs, MathSoc, and the C&D coffee shop.','DC':'Computer science, the Davis Centre Library, and study spaces. Connected to the science and engineering network.','SLC':'Your campus living room. Food, student services, bookable rooms, and places to meet between classes.','LIB':'Ten floors of discovery. Find quiet carrels, collaborative spaces, and panoramic campus views.','QNC':'Research at the smallest scale. A striking home for quantum computing and nanotechnology.','E5':'Engineering design, student teams, and bright study spaces. Connected to the engineering buildings.','PSE':'Formerly Engineering 7. Engineering research, student spaces, and the RoboHub.','STC':'Science lecture theatres, teaching labs, and a bright central atrium.','EIT':'Home to the Earth Sciences Museum and a link in the indoor science network.','TC':'Co-op interviews, career advising, and your next chapter.','PAC':'Fitness, recreation, varsity sport, and the climbing wall.','M3':'Mathematics lecture theatres and research spaces. Routes to MC and DC are affected by M4 construction.'}
used=set();buildings=[]
def inside(p,poly):
 c=False;j=len(poly)-1
 for i in range(len(poly)):
  a,b=poly[i],poly[j]
  if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:c=not c
  j=i
 return c
for u in uw:
 code=u['buildingCode']
 if code not in keep or code in used or u['latitude'] is None or u['longitude'] is None:continue
 used.add(code);p=project(float(u['latitude']),float(u['longitude']))
 candidates=[f for f in features if f['type']=='building' and inside(p,f['points'])]
 if not candidates:
  candidates=sorted([f for f in features if f['type']=='building'],key=lambda f:min(math.dist(p,q) for q in f['points']))[:1]
  if candidates and min(math.dist(p,q) for q in candidates[0]['points'])>60:candidates=[]
 f=candidates[0] if candidates else None
 poly=f['points'] if f else [[p[0]-22,p[1]-18],[p[0]+22,p[1]-18],[p[0]+22,p[1]+18],[p[0]-22,p[1]+18],[p[0]-22,p[1]-18]]
 category='study' if code=='LIB' else 'recreation' if code in ['PAC','CIF'] else 'health' if code=='HS' else 'residence' if code in ['MKV','V1C','CMH'] else 'academic'
 buildings.append({'id':code,'name':u['buildingName'],'shortName':short.get(code,u['buildingName']),'lat':u['latitude'],'lon':u['longitude'],'center':[p[0],0,p[1]],'polygon':poly,'height':floors.get(code,3)*3.8,'floors':floors.get(code,3),'category':category,'description':desc.get(code,u['buildingName']+' on the University of Waterloo main campus.'),'color':'#cfb89a' if code in ['MC','LIB','HH','B1','B2','ESC','AL'] else '#b2c1c4' if code in ['DC','QNC','E5','E6','PSE','M3','STC'] else '#c7bbb0','source':'https://github.com/uwaterloo/Datasets/blob/master/Buildings/Buildings.json','geometrySource':'OpenStreetMap' if f else 'Approximate footprint','osmId':f['id'] if f else '', 'aliases':['DP'] if code=='LIB' else ['E7','Engineering 7'] if code=='PSE' else []})
json.dump(buildings,open('src/data/buildings.json','w'),separators=(',',':'))
for f in features:f.pop('tags',None)
json.dump(features,open('src/data/map.json','w'),separators=(',',':'))
print('Prepared',len(buildings),'campus buildings;',len(features),'map features')
indoor=[];entries=[]
for x in raw:
 t=x.get('tags',{});geom=x.get('geometry',[])
 if not (t.get('indoor') not in [None,'no'] or 'entrance' in t or t.get('highway')=='elevator'):continue
 if geom:points=[project(g['lat'],g['lon']) for g in geom]
 elif 'lat'in x:points=[project(x['lat'],x['lon'])]
 else:continue
 center=[sum(p[0] for p in points)/len(points),sum(p[1] for p in points)/len(points)]
 near=sorted(buildings,key=lambda b: math.dist([b['center'][0],b['center'][2]],center))
 containing=[b for b in buildings if inside(center,b['polygon'])]
 b=containing[0] if containing else near[0]
 levels=[]
 for l in t.get('level',str(int(t.get('layer','0')) if t.get('layer','0').lstrip('-').isdigit() else 0)).split(';'):
  try:levels.append(float(l)+1)
  except:pass
 if not levels:levels=[1]
 if t.get('level:ref','').isdigit() and len(levels)==1:levels=[int(t['level:ref'])]
 typ='entrance' if 'entrance'in t else 'door' if t.get('indoor')=='door' or 'door' in t else 'room' if t.get('indoor') in ['room','area'] else 'wall' if t.get('indoor')=='wall' else 'stairs' if t.get('highway')=='steps' else 'elevator' if t.get('highway')=='elevator' else 'corridor'
 indoor.append({'id':str(x['id']),'building':b['id'],'type':typ,'points':points,'nodes':x.get('nodes',[]),'levels':levels,'ref':t.get('ref',''),'name':t.get('name',''),'room':t.get('room',''),'access':t.get('access',''),'wheelchair':t.get('wheelchair',''),'bridge':t.get('bridge')=='yes','tunnel':t.get('tunnel')=='yes','construction':t.get('highway')=='construction','amenity':t.get('amenity',''),'source':t.get('source','OpenStreetMap contributors')})
json.dump(indoor,open('src/data/indoor.json','w'),separators=(',',':'))
# Keep elevated/below-ground interior segments out of the outdoor network and ground rendering.
indoorIds={str(x['id']) for x in raw if x.get('tags',{}).get('indoor') not in [None,'no'] or x.get('tags',{}).get('highway')=='construction'}
features=[f for f in features if f['id']not in indoorIds or f['type']=='building']
json.dump(features,open('src/data/map.json','w'),separators=(',',':'))
from collections import Counter
print('Indoor features',len(indoor),'Rooms by building',Counter(f['building'] for f in indoor if f['type']=='room'))
