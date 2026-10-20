import { createElement, PenLine, Trash2, ChevronDown, ChevronUp, Star, Plus, X, Settings, Bot, Search, Check, CopyPlus, GripVertical } from 'lucide';
const icons: Record<string, any> = {'copy-plus':CopyPlus,'grip-vertical':GripVertical,'pen-line':PenLine,'trash-2':Trash2,'chevron-down':ChevronDown,'chevron-up':ChevronUp,star:Star,plus:Plus,x:X,settings:Settings,bot:Bot,search:Search,check:Check};
export function initializeIcons(root: ParentNode = document): void {
  for(const node of root.querySelectorAll<HTMLElement>('[data-lucide]')) { const icon = icons[node.dataset.lucide!]; if(icon) node.replaceWith(createElement(icon,{width:16,height:16,'stroke-width':1.7,'aria-hidden':'true'})); }
}
