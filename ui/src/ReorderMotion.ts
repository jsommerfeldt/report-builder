type Axis='x'|'y';
interface Slot {id:string;start:number;size:number;head:HTMLElement;nodes:HTMLElement[]}

/** Measure stationary slots once. Animated elements must never define their own drop targets. */
export class ReorderMotion {
  private slots:Slot[];
  private others:Slot[];
  private source?:Slot;
  private original:number;
  private rank:number;
  private painted=-1;
  private grip:number;
  private badge:HTMLDivElement;
  private offsets=new Map<string,number>();

  constructor(private container:HTMLElement, private axis:Axis, heads:HTMLElement[], id:string,
              grabOffset:number|null, peers:(index:number)=>HTMLElement[]=()=>[]) {
    const origin=this.origin();
    this.slots=heads.map((head,i)=>{
      const nodes=[head,...peers(i)];
      for(const el of nodes)for(const animation of el.getAnimations())if(animation.id==='column-settle')animation.cancel();
      const rect=head.getBoundingClientRect();
      return {id:(axis==='x'?head.dataset.previewField:head.dataset.column)!,head,nodes,
        start:(axis==='x'?rect.left:rect.top)-origin,size:axis==='x'?rect.width:rect.height};
    });
    this.original=this.slots.findIndex(slot=>slot.id===id);
    this.source=this.slots[this.original];
    this.others=this.slots.filter(slot=>slot!==this.source);
    this.rank=this.original<0?0:this.original;
    this.grip=grabOffset??(this.source?.size??0)/2;
    this.badge=document.createElement('div');
    this.badge.className='reorder-position';
    this.badge.setAttribute('aria-hidden','true');
    document.body.appendChild(this.badge);
    for(const slot of this.slots)for(const el of slot.nodes)
      el.classList.add(slot===this.source?'reorder-lifted':'reorder-neighbor');
  }
  private origin() {
    const rect=this.container.getBoundingClientRect();
    return this.axis==='x'?rect.left:rect.top;
  }
  private translate(slot:Slot,offset:number) {
    if(this.offsets.get(slot.id)===offset)return;
    this.offsets.set(slot.id,offset);
    const transform=this.transform(offset);
    for(const el of slot.nodes)el.style.transform=transform;
  }
  private transform(offset:number) {return this.axis==='x'?'translateX('+offset+'px)':'translateY('+offset+'px)';}

  update(x:number,y:number) {
    const point=(this.axis==='x'?x:y)-this.origin();
    // A small dead band at each midpoint keeps a slight reversal from flipping the slot.
    const crosses=(slot:Slot,pad:number)=>slot.start+slot.size/2+pad;
    while(this.rank<this.others.length && point>crosses(this.others[this.rank],4))this.rank++;
    while(this.rank>0 && point<crosses(this.others[this.rank-1],-4))this.rank--;
    if(this.rank!==this.painted){
      this.painted=this.rank;
      const label='Column '+(this.rank+1);
      this.badge.textContent=label;
      if(this.source){
        const order=this.others.slice();order.splice(this.rank,0,this.source);
        let start=this.slots[0].start;
        order.forEach((slot,i)=>{
          if(slot!==this.source)this.translate(slot,start-slot.start);
          const next=this.slots[i+1];
          const gap=next?next.start-this.slots[i].start-this.slots[i].size:0;
          start+=slot.size+gap;
        });
      }
    }
    if(this.source){
      const last=this.slots[this.slots.length-1];
      const start=Math.max(this.slots[0].start,Math.min(last.start+last.size-this.source.size,point-this.grip));
      this.translate(this.source,start-this.source.start);
    }
    this.badge.style.left=Math.max(4,Math.min(innerWidth-110,x+12))+'px';
    this.badge.style.top=Math.max(4,Math.min(innerHeight-29,y+17))+'px';
  }
  destination() {
    if(this.source && this.original===this.rank)return null;
    const before=this.others[this.rank];
    return before?{anchor:before.id,after:false}:{anchor:this.others[this.rank-1]?.id,after:true};
  }
  finish(settle:boolean) {
    const animate=settle && !!this.source && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const positions=animate?this.slots.map(s=>s.head.getBoundingClientRect()):[];
    for(const slot of this.slots)for(const el of slot.nodes){
      el.classList.remove('reorder-lifted','reorder-neighbor');el.style.removeProperty('transform');
    }
    this.badge.remove();
    if(animate)requestAnimationFrame(()=>{
      this.slots.forEach((slot,i)=>{
        if(!slot.head.isConnected || slot.head.classList.contains('reorder-lifted') || slot.head.classList.contains('reorder-neighbor'))return;
        const now=slot.head.getBoundingClientRect();
        const delta=this.axis==='x'?positions[i].left-now.left:positions[i].top-now.top;
        if(Math.abs(delta)<1)return;
        for(const el of slot.nodes)if(el.isConnected)el.animate([{transform:this.transform(delta)},{transform:'none'}],
          {id:'column-settle',duration:140,easing:'ease-out'});
      });
    });
  }
}
