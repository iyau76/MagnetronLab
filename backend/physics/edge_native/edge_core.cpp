// C++17 strict double DOPRI5(4). Internal units mm, ns. Export units SI.
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <memory>
#include <functional>
#include <mutex>
#include <condition_variable>
#include <thread>
#include <vector>
#ifndef AXIS_ROUTE
#define AXIS_ROUTE 5
#endif
#ifndef TILT_ROUTE
#define TILT_ROUTE 6
#endif
#ifndef INITIAL_PRUNE
#define INITIAL_PRUNE 1
#endif
#ifdef _WIN32
#define API extern "C" __declspec(dllexport)
#else
#define API extern "C" __attribute__((visibility("default")))
#endif
inline double norm(double x,double y){return std::sqrt(x*x+y*y);}
constexpr double EM=0.1758820010772163;

struct SCGrid {
 int nx,nz; double dx,dz,L; const double* co;
 // Knots are boundary, cell centres, boundary. co: [nx+1,nz+1,4,4].
 void eval(double x,double z,double& d,double& gx,double& gz)const {
  auto loc=[](double q,double h,int n,int& i,double& u,double& w){
   i=std::clamp(int(std::floor(q/h)),0,n-1);w=h;u=(q-i*h)/h;
  };
  int i,j;double u,v,hx,hz;loc(x,dx,nx,i,u,hx);loc(z+L/2,dz,nz,j,v,hz);
  // Stages can slightly cross an absorbing surface: polynomial continuation.
  u=std::clamp(u,-1.,2.);v=std::clamp(v,-1.,2.);
  const double* p=co+((i*nz+j)*16);
  double a[4],b[4];for(int k=0;k<4;k++){
   a[k]=((p[4*k+3]*v+p[4*k+2])*v+p[4*k+1])*v+p[4*k];
   b[k]=(3*p[4*k+3]*v+2*p[4*k+2])*v+p[4*k+1];
  }
  d=((a[3]*u+a[2])*u+a[1])*u+a[0];
  gx=((3*a[3]*u+2*a[2])*u+a[1])/hx;
  gz=(((b[3]*u+b[2])*u+b[1])*u+b[0])/hz;
 }
 void deposit(double x,double z,double dt,double* h)const {
  double q=std::clamp(x/dx-.5,0.,double(nx-1));
  double s=std::clamp((z+L/2)/dz-.5,0.,double(nz-1));
  int i=std::min(nx-2,int(q)),j=std::min(nz-2,int(s));double u=q-i,v=s-j;
  h[i*nz+j]+=dt*(1-u)*(1-v);h[(i+1)*nz+j]+=dt*u*(1-v);
  h[i*nz+j+1]+=dt*(1-u)*v;h[(i+1)*nz+j+1]+=dt*u*v;
 }
};
struct Accumulator { const SCGrid* grid;double* hist; };
struct Config {double ua,uf,a,b,L,Bx,Bz,tmax,rtol; int threads;const SCGrid* sc=nullptr;double eL=35,rout=20,gap=0,aperture=4.55;bool kill_lip=false;};
struct Control {std::atomic<int> cancel{0},next{0}; int n; std::unique_ptr<std::atomic<int>[]> done; Control(int n_):n(n_),done(new std::atomic<int>[n_]){for(int i=0;i<n;i++)done[i]=0;}};
API void* mg_control(int n){try{return new Control(n);}catch(...){return nullptr;}}
API void mg_cancel(void* h){static_cast<Control*>(h)->cancel.store(1);}
API int mg_progress(void* h){auto c=static_cast<Control*>(h);int i=0;while(i<c->n&&c->done[i].load(std::memory_order_acquire))++i;return i;}
API void mg_destroy(void* h){delete static_cast<Control*>(h);}
struct Dense {double a[5];double at(double s)const{return (((a[4]*s+a[3])*s+a[2])*s+a[1])*s+a[0];}};
// Dormand-Prince continuous extension, as published in scipy.integrate.RK45.
static const double DP_P[7][4]={
 {1,-8048581381./2820520608,8663915743./2820520608,-12715105075./11282082432},
 {0,0,0,0}, {0,131558114200./32700410799,-68118460800./10900136933,87487479700./32700410799},
 {0,-1754552775./470086768,14199869525./1410260304,-10690763975./1880347072},
 {0,127303824393./49829197408,-318862633887./49829197408,701980252875./199316789632},
 {0,-282668133./205662961,2019193451./616988883,-1453857185./822651844},
 {0,40617522./29380423,-110615467./29380423,69997945./29380423}};
double poly(const double* a,int n,double x){double y=a[n];for(int i=n-1;i>=0;--i)y=y*x+a[i];return y;}
int roots(const double* a,int n,double* out){
 while(n>0&&std::abs(a[n])<1e-26)--n;if(n==0)return 0;
 if(n==1){double s=-a[0]/a[1];if(s>1e-11&&s<=1.){out[0]=s;return 1;}return 0;}
 double d[10],crit[10],edges[12];for(int i=1;i<=n;i++)d[i-1]=i*a[i];int k=roots(d,n-1,crit);edges[0]=0;for(int i=0;i<k;i++)edges[i+1]=crit[i];edges[k+1]=1.;int count=0;
 for(int i=0;i<=k;i++){double lo=edges[i],hi=edges[i+1],f=poly(a,n,lo),g=poly(a,n,hi);if(f*g>0)continue;if(std::abs(g)<1e-22){if(hi>1e-11)out[count++]=hi;continue;}if(f==0){lo+=1e-11;f=poly(a,n,lo);if(f*g>0)continue;}
 for(int j=0;j<45&&hi-lo>2e-12;j++){double m=(lo+hi)*.5,q=poly(a,n,m);if(f*q<=0)hi=m;else{lo=m;f=q;}}double s=(hi+lo)*.5;if(s>1e-11)out[count++]=s;}
 return count;
}
void bounds(const Dense& p,double& lo,double& hi){
 double b[]={p.a[0],p.a[0]+p.a[1]/4,p.a[0]+p.a[1]/2+p.a[2]/6,
 p.a[0]+3*p.a[1]/4+p.a[2]/2+p.a[3]/4,p.at(1)};
 lo=*std::min_element(b,b+5);hi=*std::max_element(b,b+5);
}
struct Outcome {bool refine=false;int code=4,steps=0;double t=0,x=0,y=0,z=0,energy=0,zmax=0;};
struct Point {double t,x,y,z,vx,vy,vz;};
template<int N> struct Field {
 Config c; double il,omega,omega_x,gradient,base_voltage,radial_scale,axial_scale,log_b,p=0; mutable double radius=0;
 Field(Config c_,const double* s):c(c_),il(1/std::log(c.b/c.a)),omega(EM*1000*c.Bz),omega_x(EM*1000*c.Bx),gradient(c.uf/c.L),base_voltage(c.ua-c.uf*.5),radial_scale(EM*il),axial_scale(EM*gradient*il),log_b(std::log(c.b)){if(N==4||N==5)p=(s[0]*s[4]-s[1]*s[3])*1e-3-omega*(s[0]*s[0]+s[1]*s[1])*1e6/2;}
 void operator()(const double* y,double* f)const{
 if constexpr(N==5){
 const double r=c.a*std::exp(y[0]),r2=r*r,v=base_voltage-gradient*y[1];
 radius=r;f[0]=y[2];f[1]=r*y[3];f[2]=p*p/r2-omega*omega*r2/4+EM*v*il;
 f[3]=r*EM*gradient*(1-y[0]*il);f[4]=r;if(c.sc){double d,gx,gz;c.sc->eval(y[0],y[1],d,gx,gz);f[2]-=EM*gx;f[3]-=r*EM*gz;}
 }else if constexpr(N==4){double r=std::max(y[0],c.a*.01),z=y[1];double v=base_voltage-gradient*z;f[0]=y[2];f[1]=y[3];f[2]=p*p/(r*r*r)-omega*omega*r/4+radial_scale*v/r;f[3]=c.uf!=0?axial_scale*(log_b-std::log(r)):0;}
 else {double x=y[0],yy=y[1],z=y[2],r2=std::max(x*x+yy*yy,c.a*c.a*1e-4);double v=base_voltage-gradient*z,er=radial_scale*v/r2,ez=c.uf!=0?axial_scale*(log_b-.5*std::log(r2)):0;f[0]=y[3];f[1]=y[4];f[2]=y[5];f[3]=er*x-omega*y[4];f[4]=er*yy+omega*y[3]-omega_x*y[5];f[5]=ez+omega_x*y[4];
 if(c.sc){double phi,gx,gz;c.sc->eval(.5*std::log(r2/(c.a*c.a)),z,phi,gx,gz);
 f[3]=EM*gx*x/r2-omega*y[4];f[4]=EM*gx*yy/r2+omega*y[3]-omega_x*y[5];f[5]=EM*gz+omega_x*y[4];}
 if constexpr(N==7){double r=std::sqrt(r2);for(int j=0;j<6;j++)f[j]*=r;f[6]=r;}}
 }
};
template<int N> Outcome integrate(const double* initial,Config c,Control* ctrl,std::vector<Point>* path=nullptr,Accumulator* deposition=nullptr){
 Field<N> force(c,initial);double y[N],k[7][N],next[N],temp[N];
 if constexpr(N==4||N==5){double r=norm(initial[0],initial[1]);y[0]=r*1000;y[1]=initial[2]*1000;y[2]=(initial[0]*initial[3]+initial[1]*initial[4])/r*1e-6;y[3]=initial[5]*1e-6;if constexpr(N==5){y[0]=std::log(r*1000/c.a);y[4]=0;}}
 else {for(int j=0;j<6;j++)y[j]=initial[j]*(j<3?1000:1e-6);if constexpr(N==7)y[6]=0;}
 
 double energy0=0,energymax=0;
 auto energy=[&](){
  if constexpr(N==5){double r=c.a*std::exp(y[0]),vr=y[2],vt=force.p/r+force.omega*r/2;
   double phi=c.uf*(y[1]/c.L+.5)+(c.ua-c.uf*(y[1]/c.L+.5))*y[0]*force.il;
   double d=0,gx,gz;if(c.sc)c.sc->eval(y[0],y[1],d,gx,gz);
   return (vr*vr+vt*vt+y[3]*y[3])/(2*EM)-phi+d;
  }else {double r=norm(y[0],y[1]),phi=0,gx,gz;
 if(c.sc)c.sc->eval(std::log(r/c.a),y[2],phi,gx,gz);
 else phi=c.uf*(y[2]/c.L+.5)+(c.ua-c.uf*(y[2]/c.L+.5))*std::log(r/c.a)*force.il;
 return (y[3]*y[3]+y[4]*y[4]+y[5]*y[5])/(2*EM)-phi;}
 };
 energy0=energy();
double maxz=0;auto point=[&](double t){if constexpr(N==6)maxz=std::max(maxz,std::abs(y[2]));energymax=std::max(energymax,std::abs(energy()-energy0));if constexpr(N==6)if(path)path->push_back({t,y[0],y[1],y[2],y[3],y[4],y[5]});};
 double t=0,h=1e-4;int steps=0,rejects=0;force(y,k[0]);point(0);Outcome result;double previous_radius=force.radius;
 const double gyro=norm(c.Bx,c.Bz)*EM*1000;
 const double hmax=c.tmax;
 constexpr bool sundman=N==5||N==7; constexpr int dim=(N==4||N==5)?2:3;
 static const double A[6][6]={{1./5},{3./40,9./40},{44./45,-56./15,32./9},{19372./6561,-25360./2187,64448./6561,-212./729},{9017./3168,-355./33,46732./5247,49./176,-5103./18656},{35./384,0,500./1113,125./192,-2187./6784,11./84}};
 static const double D[7]={35./384-5179./57600,0,500./1113-7571./16695,125./192-393./640,-2187./6784+92097./339200,11./84-187./2100,-1./40};
 while(t<c.tmax){
 if((steps&63)==0&&ctrl&&ctrl->cancel.load(std::memory_order_relaxed)){result.code=-2;break;}
 if(steps>2000000||rejects>1000000){result.code=-1;break;}
 if constexpr(!sundman)h=std::min(h,c.tmax-t);
 // Display sampling is separate from terminal integration accuracy.
 if constexpr(N==6){if(path){double v=std::sqrt(y[3]*y[3]+y[4]*y[4]+y[5]*y[5]),acc=std::sqrt(k[0][3]*k[0][3]+k[0][4]*k[0][4]+k[0][5]*k[0][5]);if(v>1e-5&&acc>0)h=std::min(h,.07*v/acc);}}
 if(h<1e-13){result.code=-1;break;}
 for(int s=1;s<7;s++){for(int j=0;j<N;j++){double sum=0;for(int q=0;q<s;q++)sum+=A[s-1][q]*k[q][j];temp[j]=y[j]+h*sum;}force(temp,k[s]);if(s==6)for(int j=0;j<N;j++)next[j]=temp[j];}
 double err=0;for(int j=0;j<N;j++){
 double er=0;for(int q=0;q<7;q++)er+=D[q]*k[q][j];er*=h;
 double old=y[j],val=next[j];
 if constexpr(N==5){if(j==0){old=previous_radius;val=force.radius;er=val*(std::abs(er)<1e-3?(-er+er*er/2-er*er*er/6):std::expm1(-er));}}
 double absolute=(j<dim||(sundman&&j==N-1))?1e-9:1e-10;
 double scale=absolute+c.rtol*std::max(std::abs(old),std::abs(val));
 double ratio=std::abs(er)/scale;if(!std::isfinite(ratio)){err=1e100;break;}err=std::max(err,ratio);
 }
 if(!std::isfinite(err)){result.code=-1;break;}
 if(err>1){h*=std::max(.1,.9*std::pow(err,-.2));++rejects;continue;}
 double first=2;int code=4;Dense dense[N];
 auto interpolate=[&](int j){
 double fourth=0;for(int stage=0;stage<7;stage++)fourth+=k[stage][j]*DP_P[stage][3];fourth*=h;
 dense[j].a[0]=y[j];dense[j].a[1]=h*k[0][j];
 dense[j].a[2]=3*(next[j]-y[j])-h*(2*k[0][j]+k[6][j])+fourth;
 dense[j].a[3]=2*(y[j]-next[j])+h*(k[0][j]+k[6][j])-2*fourth;dense[j].a[4]=fourth;
 };
 for(int j=0;j<dim;j++)interpolate(j);if constexpr(sundman)interpolate(N-1);
 auto take=[&](const double* a,int degree,int kind){double rr[10];int n=roots(a,degree,rr);for(int i=0;i<n;i++)if(rr[i]<first){
 if(kind==1){double zz=dense[2].at(rr[i]);if(std::abs(zz)>c.eL*.5+1e-9)continue;
 if(c.gap>0&&std::abs(std::abs(zz)-7.5)<c.gap*.5-1e-9)continue;}
 first=rr[i];code=kind;}};
 if constexpr(N==4||N==5){double lo,hi;bounds(dense[0],lo,hi);double inner=N==5?0:c.a,outer=N==5?1/force.il:c.b;
 if(lo<=inner){double q[5];std::copy(dense[0].a,dense[0].a+5,q);q[0]-=inner;if(t==0&&std::abs(q[0])<1e-12)q[0]=0;take(q,4,0);}
 if(hi>=outer){double q[5];std::copy(dense[0].a,dense[0].a+5,q);q[0]-=outer;take(q,4,1);}}
 else {double lx,hx,ly,hy;bounds(dense[0],lx,hx);bounds(dense[1],ly,hy);
 double rhi=norm(std::max(std::abs(lx),std::abs(hx)),std::max(std::abs(ly),std::abs(hy)));
 double rlo=norm(lx<=0&&hx>=0?0:std::min(std::abs(lx),std::abs(hx)),ly<=0&&hy>=0?0:std::min(std::abs(ly),std::abs(hy)));
 if(rhi>=c.b||rlo<=c.a){double q[9]={0};for(int i=0;i<5;i++)for(int j=0;j<5;j++)q[i+j]+=dense[0].a[i]*dense[0].a[j]+dense[1].a[i]*dense[1].a[j];
 if(rhi>=c.b){q[0]-=c.b*c.b;take(q,8,1);q[0]+=c.b*c.b;}
 if(rlo<=c.a){q[0]-=c.a*c.a;if(t==0&&std::abs(q[0])<1e-12)q[0]=0;take(q,8,0);}}}

 if constexpr(N==6){
 double q[9]={0};for(int i=0;i<5;i++)for(int j=0;j<5;j++)q[i+j]+=dense[0].a[i]*dense[0].a[j]+dense[1].a[i]*dense[1].a[j];
 q[0]-=c.rout*c.rout;if(norm(next[0],next[1])>=c.rout)take(q,8,3);
 // Optional annular end flange, or old kill-at-mouth ablation.
 if(c.aperture<c.b || c.kill_lip)for(int sign:{-1,1}){
 double qq[5];std::copy(dense[2].a,dense[2].a+5,qq);qq[0]-=sign*c.eL*.5;
 double rr[10];int nn=roots(qq,4,rr);for(int j=0;j<nn;j++)if(rr[j]<first){
 double rad=norm(dense[0].at(rr[j]),dense[1].at(rr[j]));
 if(c.kill_lip || (rad>=c.aperture && rad<=c.b)){first=rr[j];code=c.kill_lip?3:1;}}}
 }
 double lo,hi;bounds(dense[dim-1],lo,hi);if(lo<=-c.L/2||hi>=c.L/2){for(int sign:{-1,1}){double q[5];std::copy(dense[dim-1].a,dense[dim-1].a+5,q);q[0]-=sign*c.L/2;take(q,4,3);}}
 if constexpr(sundman){if(next[N-1]>=c.tmax){double q[5];std::copy(dense[N-1].a,dense[N-1].a+5,q);q[0]-=c.tmax;take(q,4,4);}}
 if constexpr(N==4||N==5){if(c.rtol>1e-8&&y[2]<0&&next[2]>=0){double low,high;bounds(dense[0],low,high);double near=N==5?std::log((c.a+1e-4)/c.a):c.a+1e-4;if(low<near)result.refine=true;}}

 if constexpr(N==5){if(deposition){
  double stop=std::min(1.,first),xl,xh,zl,zh;bounds(dense[0],xl,xh);bounds(dense[1],zl,zh);
  int subdivisions=std::clamp(int(std::ceil(std::max((xh-xl)/deposition->grid->dx,(zh-zl)/deposition->grid->dz))),1,128);
  for(int s=0;s<subdivisions;s++)for(double gauss:{-.5773502691896258,.5773502691896258}){
   double q=(s+.5+.5*gauss)*stop/subdivisions;
   const auto& tm=dense[4].a;
   double dt=((4*tm[4]*q+3*tm[3])*q+2*tm[2])*q+tm[1];
   deposition->grid->deposit(dense[0].at(q),dense[1].at(q),dt*stop/(2*subdivisions)*1e-9,deposition->hist);
  }
 }}
 ++steps;
 if(first<=1){for(int j=dim;j<N;j++)if(!sundman||j!=N-1)interpolate(j);for(int j=0;j<N;j++)y[j]=dense[j].at(first);if constexpr(sundman)t=y[N-1];else t+=h*first;point(t);result.code=code;
 if constexpr(N==4||N==5){if(c.rtol>1e-8&&code==0&&std::abs(y[2])<.02)result.refine=true;}break;}
 previous_radius=force.radius;for(int j=0;j<N;j++){y[j]=next[j];k[0][j]=k[6][j];}if constexpr(sundman)t=y[N-1];else t+=h;point(t);h*=err>1e-20?std::clamp(.9*std::pow(err,-.2),.2,5.):5.;
 }
 result.zmax=maxz;result.energy=energymax;result.steps=steps;result.t=t*1e-9;if constexpr(N==4||N==5){result.x=(N==5?c.a*std::exp(y[0]):y[0])*.001;result.y=0;result.z=y[1]*.001;}else{result.x=y[0]*.001;result.y=y[1]*.001;result.z=y[2]*.001;}return result;
}
Config parse(const double* p,int threads){return {p[0],p[1],p[2]*1000,p[3]*1000,p[4]*1000,p[5],p[6],p[7]*1e9,p[8],threads};}
void save(const Outcome& r,double* o){o[0]=r.code;o[1]=r.t;o[2]=r.x;o[3]=r.y;o[4]=r.z;o[5]=r.steps;}


API int edge_batch(const double* states,int n,const double* p,int threads,
 const double* coefficients,int nx,int nz,int active,double* out){
 try{Config c=parse(p,threads);c.eL=p[9];c.rout=p[10];c.gap=p[11];c.aperture=p[12];c.kill_lip=p[13]>0;
 SCGrid grid{nx,nz,std::log(c.rout/c.a)/nx,c.L/nz,c.L,coefficients};if(active)c.sc=&grid;
 std::atomic<int> next{0};std::vector<std::thread> team;
 for(int t=0;t<std::max(1,threads);t++)team.emplace_back([&]{for(;;){int i=next.fetch_add(1);if(i>=n)break;
 auto r=integrate<6>(states+6*i,c,nullptr);save(r,out+8*i);out[8*i+6]=r.energy;out[8*i+7]=r.zmax*.001;}});
 for(auto& t:team)t.join();return 0;}catch(...){return -1;}}
