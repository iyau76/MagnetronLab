"""Responsive HTTP process and one bounded, cancellable scientific worker."""
import os,sys,json,time,uuid,threading,traceback,webbrowser,multiprocessing as mp,queue,socket
from pathlib import Path
from collections import OrderedDict
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlparse,parse_qs
if __package__:
    from .settings import DEFAULT,parameters,THREAD_CHOICES,FAST_THREADS,LOGICAL
else:
    from settings import DEFAULT,parameters,THREAD_CHOICES,FAST_THREADS,LOGICAL
BACKEND_ROOT=Path(__file__).resolve().parent
PROJECT_ROOT=BACKEND_ROOT.parent
ROOT=Path(getattr(sys,'_MEIPASS',BACKEND_ROOT))
PHYSICS_ROOT=ROOT/'physics'
DEFAULT_WEB_ROOT=ROOT/'web' if getattr(sys,'frozen',False) else PROJECT_ROOT/'frontend'
APPLICATION_ID='magnetron-lab-finals-native'
INSTANCE_PATH=str(Path(sys.executable).resolve().parent if getattr(sys,'frozen',False) else Path(__file__).resolve().parent)
JOBS=OrderedDict();LOCK=threading.Lock();ACTIVE=None
WORKER_STATUS={'state':'starting','threads_limit':FAST_THREADS}
GEOMETRY_PRESETS={
 'specimen_35mm_20261107':{'anode_radius_mm':4.55,'filament_radius_um':37.5,'length_mm':35.,'central_mm':15.},
 'prelim_legacy_20mm':{'anode_radius_mm':4.55,'filament_radius_um':50.,'length_mm':20.,'central_mm':10.}}

def worker_main(commands,events,cancel,generation):
    os.environ['NUMBA_NUM_THREADS']=str(FAST_THREADS)
    os.environ['OMP_NUM_THREADS']='1';os.environ['OPENBLAS_NUM_THREADS']='1'
    import psutil
    process=psutil.Process();process.nice(psutil.NORMAL_PRIORITY_CLASS)
    sys.path.insert(0,str(PHYSICS_ROOT))
    begin=time.perf_counter()
    from service import execute,warm,Cancelled,ENGINE,close_cache
    try:
        warm();events.put((None,{'state':'ready','engine':ENGINE,'startup_s':round(time.perf_counter()-begin,3)}))
    except Exception as ex:
        events.put((None,{'state':'error','message':str(ex)}));traceback.print_exc();return
    while True:
        item=commands.get()
        if item is None:
            try:close_cache()
            except Exception:traceback.print_exc()
            return
        ident,kind,p,job_generation=item
        cancelled=lambda:cancel.is_set() or generation.value!=job_generation
        if cancelled():
            events.put((ident,{'state':'cancelled'}));continue
        events.put((ident,{'state':'running'}))
        try:
            if kind.startswith('edge_'):
                from edge_field import execute as edge_execute
                result=edge_execute(kind,p,lambda u:events.put((ident,u)),cancelled)
            else:result=execute(kind,p,lambda u:events.put((ident,u)),cancelled)
            memory=process.memory_info()
            result['worker_memory_mb']=round(memory.rss/1024**2,1)
            result['worker_peak_mb']=round(memory.peak_wset/1024**2,1)
            events.put((ident,{'state':'cancelled' if result.get('cancelled') else 'done','result':result,'cached':result['stats']['integrated_particles']==0}))
        except Cancelled:events.put((ident,{'state':'cancelled'}))
        except Exception as ex:
            traceback.print_exc();events.put((ident,{'state':'error','message':str(ex)}))

def receive_events():
    global ACTIVE
    while True:
        try:ident,update=EVENTS.get(timeout=.5)
        except queue.Empty:
            if not worker.is_alive():
                with LOCK:
                    message=f'计算进程已退出（{worker.exitcode}），请重新启动实验室'
                    WORKER_STATUS.update(state='error',message=message)
                    if ACTIVE is not None:JOBS[ACTIVE].update(state='error',message=message);ACTIVE=None
                return
            continue
        with LOCK:
            if ident is None:WORKER_STATUS.update(update)
            elif ident in JOBS:
                job=JOBS[ident]
                # Late worker messages must never resurrect a replaced job or
                # clear the identity of its newer replacement.
                if job.get('cancel_requested'):
                    if update.get('state') in ['done','error','cancelled']:
                        job['state']='cancelled'
                else:
                    if 'row' in update:
                        job['_row_events'].append(update['row'])
                    job.update({k:v for k,v in update.items() if k!='row'})
                if ACTIVE==ident and update.get('state') in ['done','error','cancelled']:ACTIVE=None

class ExclusiveHTTPServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR permits competing listeners; claim the port exclusively.
    allow_reuse_address=os.name!='nt'

    def server_bind(self):
        if os.name=='nt':
            self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
        super().server_bind()

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(kwargs.pop('directory',DEFAULT_WEB_ROOT)),**kwargs)
    def do_HEAD(self):
        if self.server.api_only:return self.send_error(404,'Static frontend disabled')
        super().do_HEAD()
    def log_message(self,fmt,*args):
        if args and str(args[0]).startswith('GET /api/job/'):return
        super().log_message(fmt,*args)
    def end_headers(self):
        # Dev assets change during development; stale module caches have
        # already produced phantom "missing export" failures in E2E.
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
    def send_json(self,data,status=200):
        raw=json.dumps(data,ensure_ascii=False).encode('utf-8')
        try:
            self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
        except ConnectionError:
            # A replaced scan/trace may legitimately have no remaining reader.
            pass
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/defaults':return self.send_json(DEFAULT|{'thread_choices':THREAD_CHOICES,'fast_threads':FAST_THREADS,'logical_cores':LOGICAL,'geometry_presets':GEOMETRY_PRESETS})
        if path=='/api/health':return self.send_json({'status':'ready','worker':dict(WORKER_STATUS),'hardware_control':False,'version':'finals-native-v1','application_id':APPLICATION_ID,'instance_path':INSTANCE_PATH})
        if path.startswith('/api/job/'):
            try:
                since=parse_qs(urlparse(self.path).query).get('since')
                cursor=None if since is None else int(since[0])
                if cursor is not None and cursor<0:raise ValueError()
            except ValueError:return self.send_json({'message':'since must be a nonnegative cursor'},400)
            with LOCK:
                job=dict(JOBS.get(path.rsplit('/',1)[-1],{}))
                if job:
                    events=job.pop('_row_events',[])
                    job['next_cursor']=len(events)
                    job['rows']=events[:] if cursor is None else events[cursor:]
                    if cursor is not None:
                        if cursor>0:job.pop('preview_rows',None)
                        if 'result' in job:
                            job['result']={k:v for k,v in job['result'].items() if k not in ('rows','preview_rows')}
            return self.send_json(job or {'message':'任务已过期'},200 if job else 404)
        if self.server.api_only:return self.send_json({'message':'接口不存在'},404)
        super().do_GET()
    def do_POST(self):
        global ACTIVE
        if self.path=='/api/shutdown':
            CANCEL.set();self.send_json({'stopping':True})
            threading.Thread(target=self.server.shutdown,daemon=True).start();return
        if self.path.startswith('/api/cancel/'):
            ident=self.path.rsplit('/',1)[-1]
            with LOCK:
                if ACTIVE==ident:
                    with GENERATION.get_lock():GENERATION.value+=1
                    JOBS[ident].update(cancel_requested=True,state='cancelled');ACTIVE=None
            return self.send_json({'cancel_requested':True})
        if self.path not in ['/api/point','/api/scan','/api/trace','/api/particles','/api/edge/point','/api/edge/scan']:return self.send_json({'message':'接口不存在'},404)
        try:
            body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if not isinstance(body,dict):raise TypeError('请求体必须是对象')
            # 界面直接提交物理参数；{params:{...}} 形式同样接受，便于外部脚本调用。
            p=parameters(body.get('params') if isinstance(body.get('params'),dict) else body,
                allow_local_potential=self.path=='/api/trace')
            if self.path.startswith('/api/edge/'):
                raw=body.get('params') if isinstance(body.get('params'),dict) else body
                p['edge_boundary']=raw.get('edge_boundary','open')
                if p['edge_boundary'] not in ('open','flange','seam','kill'):raise ValueError('Unknown finite-field boundary')
                if any(abs(p[k]-v)>1e-10 for k,v in GEOMETRY_PRESETS['specimen_35mm_20261107'].items()):
                    raise ValueError('有限开口场目前采用标准管几何：35 mm、中央15 mm、两侧各10 mm')
        except (ValueError,TypeError,KeyError) as ex:return self.send_json({'message':str(ex)},400)
        if self.path in ('/api/trace','/api/particles'):
            try:
                sys.path.insert(0,str(PHYSICS_ROOT))
                from service import trace,particles,Cancelled
                if self.path=='/api/particles':return self.send_json(particles(p,cache_terminals=False,cancel=CANCEL.is_set))
                options=body.get('params') if isinstance(body.get('params'),dict) else body
                ids=body.get('particle_ids')
                if ids is not None:
                    if not isinstance(ids,list) or not 1<=len(ids)<=12 or any(type(i) is not int or not 0<=i<32768 for i in ids):
                        raise ValueError('particle_ids must contain 1..12 particle indices')
                    return self.send_json({'traces':[trace(p,i,include_zero_field=False) for i in ids]})
                result=trace(p,body.get('particle_id',options.get('particle_id',0)),
                    body.get('initial_state',options.get('initial_state')),
                    body.get('include_zero_field',options.get('include_zero_field',True)),
                    body.get('series',options.get('series',[])))
                return self.send_json(result)
            except Cancelled:return self.send_json({'message':'计算已取消'},503)
            except (ValueError,TypeError) as ex:return self.send_json({'message':str(ex)},400)
            except Exception as ex:
                traceback.print_exc();return self.send_json({'message':str(ex)},500)
        with LOCK:
            if WORKER_STATUS['state']!='ready':return self.send_json({'message':'计算核心正在准备，请稍候'},503)
            ident=uuid.uuid4().hex[:12];kind=('edge_' if self.path.startswith('/api/edge/') else '')+self.path.rsplit('/',1)[-1]
            if ACTIVE is not None:
                JOBS[ACTIVE].update(cancel_requested=True,state='cancelled',superseded_by=ident)
            with GENERATION.get_lock():GENERATION.value+=1;job_generation=GENERATION.value
            ACTIVE=ident;JOBS[ident]={'state':'queued','done':0,'total':1,'kind':kind,'cached':False,'_row_events':[]}
            while len(JOBS)>12:JOBS.popitem(last=False)
            COMMANDS.put_nowait((ident,kind,p,job_generation))
        self.send_json({'id':ident},202)

def main(argv=None):
    global COMMANDS,EVENTS,CANCEL,GENERATION,worker
    mp.freeze_support()
    import argparse
    parser=argparse.ArgumentParser(description='磁截止实验室本机服务')
    parser.add_argument('--port',type=int,default=8877)
    parser.add_argument('--open',action='store_true')
    parser.add_argument('--api-only',action='store_true',help='仅提供 HTTP API，不读取前端目录')
    parser.add_argument('--web-root',type=Path,default=DEFAULT_WEB_ROOT,help='静态前端目录')
    args=parser.parse_args(argv)
    web_root=args.web_root.expanduser().resolve()
    if not args.api_only and not web_root.is_dir():
        parser.error(f'前端目录不存在：{web_root}；可指定 --web-root 或 --api-only')
    from functools import partial
    # Bind first so an occupied port cannot leave a numerical worker behind.
    server=ExclusiveHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(web_root)))
    server.api_only=args.api_only
    COMMANDS=mp.Queue();EVENTS=mp.Queue();CANCEL=mp.Event();GENERATION=mp.Value('L',0)
    # A non-daemonic owner can spawn the persistent field workers.
    worker=mp.Process(target=worker_main,args=(COMMANDS,EVENTS,CANCEL,GENERATION));worker.start()
    threading.Thread(target=receive_events,daemon=True).start()
    address=f'http://127.0.0.1:{args.port}'
    print('磁截止实验室 '+address,flush=True)
    if args.open:threading.Timer(.6,lambda:webbrowser.open(address)).start()
    try:server.serve_forever()
    finally:
        server.server_close()
        CANCEL.set()
        try:COMMANDS.put_nowait(None)
        except queue.Full:pass
        worker.join(timeout=10)
        if worker.is_alive():worker.terminate();worker.join()

if __name__=='__main__':
    main()
