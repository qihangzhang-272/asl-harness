// Bounded session reads only. Clear on writes, external changes and explicit refresh.
export class ReadCache {
  constructor({limit=32,ttl=300000,now=Date.now}={}){this.limit=limit;this.ttl=ttl;this.now=now;this.entries=new Map();}
  read(key,load,refresh=false){
    const previous=this.entries.get(key);
    if(!refresh&&previous&&(previous.pending||this.now()-previous.time<this.ttl)){
      this.entries.delete(key);this.entries.set(key,previous);return previous.promise;
    }
    const entry={time:this.now(),pending:true};
    this.entries.set(key,entry);
    while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value);
    entry.promise=Promise.resolve().then(load).then(value=>{entry.pending=false;entry.time=this.now();return value;},error=>{
      if(this.entries.get(key)===entry)this.entries.delete(key);throw error;
    });
    return entry.promise;
  }
  clear(){this.entries.clear();}
}
