export function showPreviewInsertionLine(line:HTMLDivElement|null,scroller:Element,header:HTMLElement,after:boolean) {
  if(!line){
    line=document.createElement('div');
    line.className='preview-insertion-line';
    line.setAttribute('aria-hidden','true');
    document.body.append(line);
  }
  const bounds=scroller.getBoundingClientRect(), rect=header.getBoundingClientRect();
  const top=Math.max(bounds.top,rect.top);
  line.style.left=Math.max(bounds.left+1,Math.min(bounds.right-1,after?rect.right:rect.left))+'px';
  line.style.top=top+'px';
  line.style.height=Math.max(0,Math.min(bounds.bottom,rect.bottom)-top)+'px';
  return line;
}
