import { MAX_BYTES, validateCommand, validateQuery } from './model.js';
export function createBoardApi(storage) {
  const fail = error => Response.json({ error: ['42P01','PGRST205'].includes(error.code) ? 'Robot Party needs its reviewed database migration before the board can open. Your existing apps are unchanged.' : 'The board could not reach its database. Your unsent message is still here; please retry.' }, { status: 503 });
  return {
    async GET(request, context) {
      let query; try { query = validateQuery(new URL(request.url).searchParams); } catch (error) { return Response.json({error:error.message},{status:400}); }
      try {
        const result = await storage.read(context,query);
        if (!result) return Response.json({error:'This thread is unavailable.'},{status:404});
        return Response.json({...result,viewer:{id:context.owner.id,role:context.permission}});
      } catch(error){return fail(error);}
    },
    async POST(request,context) {
      if (context.permission === 'viewer') return Response.json({error:'You have view-only access.'},{status:403});
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') return Response.json({error:'Send JSON.'},{status:415});
      let command;
      try {
        const reader=request.body?.getReader();if(!reader) throw new Error('A message is required.');
        const chunks=[];let size=0;
        try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return Response.json({error:'Message request is too large.'},{status:413});}chunks.push(value);}}
        finally{reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        command=validateCommand(JSON.parse(new TextDecoder().decode(bytes)));
      }catch(error){return Response.json({error:error instanceof SyntaxError?'Invalid JSON.':error.message},{status:400});}
      try {
        const result=await storage.write(context,command);
        if(!result) return Response.json({error:'This message changed, was removed, or is not yours to edit. Refresh the thread before trying again.'},{status:409});
        return Response.json({saved:true,message:result});
      }catch(error){if(['23514','23503','P0001','23502'].includes(error.code))return Response.json({error:'The message or reply target is no longer valid. Refresh this thread before retrying.'},{status:409});return fail(error);}
    },
  };
}
