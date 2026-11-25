/** Ordered, paced presentation of independently prepared results.
 * Producers pass the token returned by start() to push(). Old runs cannot write.
 * An out-of-order result remains buffered until all preceding indices commit.
 */
export class SweepStreamEngine {
  constructor({onCommit=()=>{},onDone=()=>{},requestFrame=cb=>requestAnimationFrame(cb),cancelFrame=id=>cancelAnimationFrame(id),now=()=>performance.now()}={}){
    Object.assign(this,{onCommit,onDone,requestFrame,cancelFrame,now});
    this.runToken=0;this.frame=null;this.readyMap=new Map();this.active=false;this.paused=false;this.nextCommitIdx=0;
  }
  start({total,startIndex=0,intervalMs=42,delayMs=450}={}){
    this.cancel();this.total=total;this.nextCommitIdx=startIndex;this.intervalMs=intervalMs;
    this.active=true;this.paused=false;this.instant=false;this.due=this.now()+delayMs;
    this.schedule();return this.runToken;
  }
  push(index,payload,token=this.runToken){
    if(token!==this.runToken||!this.active||index<this.nextCommitIdx||index>=this.total||!Number.isInteger(index))return false;
    this.readyMap.set(index,payload);this.schedule();return true;
  }
  schedule(){if(this.frame===null&&this.active&&!this.paused)this.frame=this.requestFrame(t=>{this.frame=null;this.advance(t);});}
  advance(time){
    if(!this.active||this.paused)return;
    const token=this.runToken;
    while(this.active&&token===this.runToken&&this.readyMap.has(this.nextCommitIdx)&&(this.instant||time>=this.due)){
      const index=this.nextCommitIdx++,payload=this.readyMap.get(index);this.readyMap.delete(index);
      this.due=time+this.intervalMs;
      this.onCommit(payload,index,token);
      if(token!==this.runToken)return;
      if(this.nextCommitIdx===this.total){this.active=false;this.onDone(token);break;}
      if(!this.instant)break;
    }
    this.schedule();
  }
  pause(){if(!this.active||this.paused)return;this.paused=true;this.remainingDelay=Math.max(0,this.due-this.now());if(this.frame!==null)this.cancelFrame(this.frame);this.frame=null;}
  resume(){if(!this.active||!this.paused)return;this.paused=false;this.due=this.now()+(this.remainingDelay??0);this.schedule();}
  setSpeed(speed){this.intervalMs=42/speed;if(this.active&&!this.paused)this.due=Math.min(this.due,this.now()+this.intervalMs);}
  finish(){if(!this.active)return;this.instant=true;this.paused=false;this.advance(this.now());}
  cancel(){if(this.frame!==null)this.cancelFrame(this.frame);this.frame=null;this.active=false;this.paused=false;this.readyMap.clear();return ++this.runToken;}
}
