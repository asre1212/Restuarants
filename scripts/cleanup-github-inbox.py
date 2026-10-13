import hashlib,json,pathlib,re,urllib.request
BASE='https://table-notes-restaurants.savorymug256.chatgpt.site/api/github/receipt/'
for path in pathlib.Path('inbox').glob('*.json'):
    envelope=json.loads(path.read_text())
    if envelope.get('format')!='restaurants-encrypted-inbox' or envelope.get('version')!=1:continue
    delivery_id=envelope.get('id','')
    if not re.fullmatch(r'[A-Za-z0-9_-]{8,100}',delivery_id) or path.name!=delivery_id+'.json':continue
    ciphertext=envelope.get('ciphertext')
    if not isinstance(ciphertext,str):continue
    receipt=hashlib.sha256(ciphertext.encode()).hexdigest()
    try:
        with urllib.request.urlopen(BASE+receipt,timeout=20) as response:
            result=json.loads(response.read(4096))
        if result.get('acknowledged') is True:
            path.unlink()
            print('Removed acknowledged envelope:',path.name)
    except Exception as error:
        print('Kept envelope; receipt check unavailable:',path.name,type(error).__name__)

# Update the raw-file index after deleting only acknowledged envelopes.
files=sorted(path.name for path in pathlib.Path('inbox').glob('*.json') if path.name!='index.json' and re.fullmatch(r'[A-Za-z0-9_-]{8,100}\.json',path.name))
index=pathlib.Path('inbox/index.json')
index.write_text(json.dumps({'format':'restaurants-inbox-index','version':1,'files':files},indent=2)+'\n')
