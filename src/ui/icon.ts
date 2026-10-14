import source from '../../public/icon.svg?raw';
export function icon(size=18):SVGElement {
  const svg=new DOMParser().parseFromString(source,'image/svg+xml').documentElement as unknown as SVGElement;
  svg.setAttribute('width',String(size));svg.setAttribute('height',String(size));svg.setAttribute('aria-hidden','true');svg.classList.add('mc-icon');return document.importNode(svg,true);
}
