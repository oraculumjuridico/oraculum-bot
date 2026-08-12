"use strict"
const { Readable } = require("node:stream")
const fail=code=>{throw new Error(code)}
const esc=v=>String(v).replace(/\\/g,"\\\\").replace(/'/g,"\\'")
function createGoogleDriveSingleCaseClient({clientId,clientSecret,refreshToken,googleModule,timeoutMs=15000}={}){
  if(!clientId||!clientSecret||!refreshToken)fail("GOOGLE_DRIVE_CREDENTIALS_MISSING")
  if(!googleModule?.auth?.OAuth2||typeof googleModule.drive!=="function")fail("GOOGLE_DRIVE_MODULE_INVALID")
  if(!Number.isInteger(timeoutMs)||timeoutMs<1)fail("GOOGLE_DRIVE_TIMEOUT_INVALID")
  const oauth=new googleModule.auth.OAuth2(clientId,clientSecret,"urn:ietf:wg:oauth:2.0:oob");oauth.setCredentials({refresh_token:refreshToken});const drive=googleModule.drive({version:"v3",auth:oauth})
  async function call(fn,write=false){try{return(await fn()).data}catch(e){if(/timeout/i.test(e?.message||"")||e?.code==="ETIMEDOUT")fail(write?"GOOGLE_DRIVE_EXTERNAL_EFFECT_UNKNOWN":"GOOGLE_DRIVE_TIMEOUT");fail(write?"GOOGLE_DRIVE_EXTERNAL_EFFECT_UNKNOWN":"GOOGLE_DRIVE_REQUEST_FAILED")}}
  async function list(query){const terms=[`'${esc(query.parentId)}' in parents`,"trashed = false"]
    if(query.kind==="folder"){terms.push("mimeType = 'application/vnd.google-apps.folder'",`appProperties has { key='logicalId' and value='${esc(query.logicalId)}' }`);if(query.name!==undefined)terms.push(`name = '${esc(query.name)}'`)}
    else terms.push("mimeType != 'application/vnd.google-apps.folder'",`appProperties has { key='sha256' and value='${esc(query.sha256)}' }`)
    const files=[];let pageToken;do{const data=await call(()=>drive.files.list({q:terms.join(" and "),fields:"nextPageToken,files(id)",pageSize:1000,...(pageToken?{pageToken}:{})},{timeout:timeoutMs}));if(!data||!Array.isArray(data.files))fail("GOOGLE_DRIVE_RESPONSE_INVALID");files.push(...data.files);pageToken=data.nextPageToken}while(pageToken);return files}
  return Object.freeze({list,async getById(fileId){const d=await call(()=>drive.files.get({fileId,fields:"id,name,parents,trashed,size,appProperties"},{timeout:timeoutMs}));if(!d)return null;return{id:d.id,name:d.name,parentId:d.parents?.[0],trashed:d.trashed,logicalId:d.appProperties?.logicalId,sha256:d.appProperties?.sha256,size:d.size===undefined?undefined:Number(d.size),contentDocumentId:d.appProperties?.contentDocumentId}},async createFolder({parentId,destination}){const d=await call(()=>drive.files.create({requestBody:{name:destination.name,mimeType:"application/vnd.google-apps.folder",parents:[parentId],appProperties:{logicalId:destination.logicalId}},fields:"id"},{timeout:timeoutMs}),true);return{id:d?.id}},async upload(payload){const bytes=Buffer.from(payload.bytesBase64,"base64");const d=await call(()=>drive.files.create({requestBody:{name:payload.document.logicalName,parents:[payload.parentId],appProperties:{sha256:payload.sha256,contentDocumentId:payload.document.contentDocumentId}},media:{mimeType:"application/octet-stream",body:Readable.from([bytes])},fields:"id"},{timeout:timeoutMs}),true);return{id:d?.id}}})
}
module.exports={createGoogleDriveSingleCaseClient}
