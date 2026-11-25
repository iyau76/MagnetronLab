import { SweepStreamEngine } from '../chapter3/sweep-stream.js';

export const MODEL_GEOMETRY = Object.freeze({
  anode_radius_mm:4.55, filament_radius_um:37.5, length_mm:35, central_mm:15,
});

export function modelParameters(voltage, emission, extra={}) {
  return {...MODEL_GEOMETRY, anode_V:voltage, filament_V:3.68,
    gradient:true, temperature_K:2000, tilt_deg:0, emission_uA:emission,
    particles:8192, compute_threads:1, launch_mode:'full',
    emission_profile:'uniform', end_cooling_eta:0, progressive:true, ...extra};
}

/** Preserve the exact launch point and voltage drop of the gradient trace. */
export function localPotentialTraceRequest(params, initialState) {
  if (!Array.isArray(initialState) || initialState.length!==6 || !initialState.every(Number.isFinite)) {
    throw new TypeError('A finite six-component SI initial state is required');
  }
  const local=params.anode_V-params.filament_V*(initialState[2]/(params.length_mm*1e-3)+.5);
  return {params:{...params, gradient:false, anode_V:local, filament_V:0.0},
    initial_state:[...initialState], include_zero_field:false};
}

/** Reweight fixed physical terminals without changing total emitted current. */
export function weightedRow(row, moments, eta, emission) {
  const denominator=moments.particles-eta*moments.q_sum;
  const value=name=>{
    const part=moments.collectors[name];
    return emission*(part.count-eta*part.q_sum)/denominator;
  };
  const A1_uA=value('A1'), A2_H_uA=value('A2_H'), A2_K_uA=value('A2_K');
  return {...row,A1_uA,A2_H_uA,A2_K_uA,A2_uA:A2_H_uA+A2_K_uA,
    sum_uA:A1_uA+A2_H_uA+A2_K_uA,
    fractions:moments.outcome_counts.map((n,i)=>(n-eta*moments.outcome_q_sums[i])/denominator)};
}

const wait=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
});

/** One live scan per client. Cache arrival order never controls drawing order. */
export class PhysicsClient {
  constructor({fetcher=globalThis.fetch.bind(globalThis),base='/api',streamOptions={}}={}) {
    this.fetcher=fetcher;this.base=base;this.generation=0;this.job=null;this.control=null;
    this.callbacks={};
    this.stream=new SweepStreamEngine({...streamOptions,
      onCommit:(row,index)=>this.callbacks.onRow?.(row,index),
      onDone:()=>this.callbacks.onDone?.()});
  }
  async json(path,{signal,body}={}) {
    const response=await this.fetcher(this.base+path,{signal,
      ...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    if(!response.ok) {
      const detail=await response.json().catch(()=>({}));
      throw new Error(detail.message||`Calculation failed (${response.status})`);
    }
    return response.json();
  }
  cancel() {
    this.generation++;
    this.control?.abort();this.control=null;this.stream.cancel();
    const job=this.job;this.job=null;
    if(job)this.json(`/cancel/${job}`,{body:{}}).catch(()=>{});
  }
  async scan(params,{preset=null,endpoint='/scan',onPreview=()=>{},onRow=()=>{},onDone=()=>{},onProgress=()=>{},onError=()=>{}}={}) {
    this.cancel();const generation=this.generation;
    const control=new AbortController();this.control=control;
    this.callbacks={onRow,onDone};
    const single=endpoint.endsWith('/point');
    const fields=single?[params.field_mT]:params.fields_mT??preset?.rows.map(r=>r.field_mT);
    if(!fields?.length)throw new TypeError('An explicit field grid is required');
    const token=this.stream.start({total:fields.length,intervalMs:55,delayMs:120});
    if(preset) {
      onPreview(preset.preview_rows??preset.rows);
      for(const [i,row] of preset.rows.entries())this.stream.push(row.field_idx??i,row,token);
      onProgress({phase:'ready',done:preset.rows.length,total:fields.length,offline:true});
      return {offline:true};
    }
    try {
      const job=await this.json(endpoint,{signal:control.signal,body:{params:{...params,fields_mT:single?null:params.fields_mT,progressive:!single}}});
      if(generation!==this.generation)return;
      this.job=job.id;let cursor=0,previewSeen=false;
      while(generation===this.generation) {
        const status=await this.json(`/job/${job.id}?since=${cursor}`,{signal:control.signal});
        if(generation!==this.generation)return;
        if(status.preview_rows&&!previewSeen){previewSeen=true;onPreview(status.preview_rows);}
        for(const row of status.rows??[])this.stream.push(row.field_idx,row,token);
        cursor=status.next_cursor;onProgress(status);
        if(status.state==='done'){
          // The production single-point endpoint returns a row with its paths,
          // while scans and the isolated edge endpoint stream indexed rows.
          if(single&&status.result?.row)this.stream.push(0,{...status.result.row,field_idx:0},token);
          this.job=null;return status.result;
        }
        if(status.state==='cancelled'){this.stream.cancel();return;}
        if(status.state==='error')throw new Error(status.message||'Calculation failed');
        await wait(60,control.signal);
      }
    } catch(error) {
      if(generation!==this.generation||error.name==='AbortError')return;
      this.stream.cancel();this.job=null;onError(error);
    }
  }
  trace(params,particleId,{initialState,series=[]}={}) {
    return this.json('/trace',{body:{params,particle_id:particleId,
      ...(initialState?{initial_state:initialState}:{}),include_zero_field:false,series}});
  }
  localTrace(params,initialState) {
    return this.json('/trace',{body:localPotentialTraceRequest(params,initialState)});
  }
  finish(){this.stream.finish();}
  pause(){this.stream.pause();}
  resume(){this.stream.resume();}
}
